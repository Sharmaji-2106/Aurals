"""The clip the tuning duel plays: the best 20 seconds of a song the listener loves.

From the listener's own analysed playlist, the most-watched song (YouTube's view
count, read at selection time) is downloaded again and its "best part" found: the
20-second stretch with the highest sustained loudness — where choruses and drops
live — nudged back to the quietest moment just before it, so it starts on a phrase
rather than mid-note. It is loudness-normalised, given short fades, and written as
a WAV for the browser, which applies every tuning to it live.

Storage is deliberately short-lived and personal: one file per listener under the
project's cache, replaced when their music changes, expired after 24 hours, and
deleted with their account. Nothing else of the audio is kept.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
import time
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import numpy as np
import yt_dlp
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.analysis.decode import decode_audio
from auralis.config import get_settings
from auralis.music.models import MusicSubmission, SubmissionTrack, Track
from auralis.music.youtube import _base_options, download_audio

log = logging.getLogger(__name__)

CLIP_SECONDS = 20.0
SAMPLE_RATE = 44_100
TARGET_RMS_DB = -18.0
EXPIRY_S = 24 * 3600
CANDIDATES = 8


class ClipMeta(BaseModel):
    title: str
    artist: str
    video_id: str
    start_s: float
    duration_s: float
    view_count: int | None
    submission_id: str
    made_at: float


def clip_dir() -> Path:
    return get_settings().tuning_dir


def _paths(user_id: uuid.UUID) -> tuple[Path, Path]:
    base = clip_dir() / str(user_id)
    return base.with_suffix(".wav"), base.with_suffix(".json")


def delete_clip(user_id: uuid.UUID) -> None:
    for path in _paths(user_id):
        path.unlink(missing_ok=True)
    # Whole songs fetched so the listener could choose their own part.
    if clip_dir().exists():
        for path in clip_dir().glob(f"{user_id}-song-*"):
            path.unlink(missing_ok=True)


#: Browsers decode AAC everywhere; Opus-in-WebM not in every Safari.
SONG_FORMAT = "bestaudio[ext=m4a]/bestaudio/best"
SONG_TYPES = {
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".webm": "audio/webm",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
}


def song_file(db: Session, user_id: uuid.UUID, video_id: str) -> Path | None:
    """One of the listener's own analysed songs, whole, fetched once and kept a day.

    Only songs from their own latest playlist: the address is never a way to fetch
    arbitrary audio through this server.
    """
    songs = _songs(db, user_id)
    if songs is None or video_id not in {t.source_id for t in songs[1]}:
        return None
    clip_dir().mkdir(parents=True, exist_ok=True)
    for found in clip_dir().glob(f"{user_id}-song-{video_id}.*"):
        if time.time() - found.stat().st_mtime < EXPIRY_S:
            return found
        found.unlink(missing_ok=True)
    work = Path(tempfile.mkdtemp(prefix="song-", dir=clip_dir()))
    try:
        audio = download_audio(video_id, work, audio_format=SONG_FORMAT)
        target = clip_dir() / f"{user_id}-song-{video_id}{audio.path.suffix.lower()}"
        shutil.move(str(audio.path), target)
        return target
    finally:
        shutil.rmtree(work, ignore_errors=True)


def cached(user_id: uuid.UUID, submission_id: str) -> ClipMeta | None:
    wav, meta_path = _paths(user_id)
    if not (wav.exists() and meta_path.exists()):
        return None
    meta = ClipMeta.model_validate_json(meta_path.read_text(encoding="utf-8"))
    if meta.submission_id != submission_id or time.time() - meta.made_at > EXPIRY_S:
        delete_clip(user_id)
        return None
    return meta


def audio_path(user_id: uuid.UUID) -> Path | None:
    wav, meta = _paths(user_id)
    if not wav.exists() or not meta.exists():
        return None
    if time.time() - wav.stat().st_mtime > EXPIRY_S:
        delete_clip(user_id)
        return None
    return wav


def _songs(db: Session, user_id: uuid.UUID) -> tuple[str, list[Track]] | None:
    """The tracks of the listener's latest completed submission that were analysed."""
    sub = db.scalar(
        select(MusicSubmission)
        .where(MusicSubmission.user_id == user_id, MusicSubmission.status == "completed")
        .order_by(MusicSubmission.created_at.desc())
        .limit(1)
    )
    if sub is None:
        return None
    tracks = db.scalars(
        select(Track)
        .join(SubmissionTrack, SubmissionTrack.track_id == Track.id)
        .where(SubmissionTrack.submission_id == sub.id, SubmissionTrack.status == "done")
        .order_by(SubmissionTrack.position)
    ).all()
    return (str(sub.id), list(tracks)) if tracks else None


def _views(video_id: str) -> int:
    opts: dict[str, Any] = {**_base_options(), "skip_download": True, "noplaylist": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        return int((info or {}).get("view_count") or 0)
    except Exception:
        return 0


def _most_famous(tracks: list[Track]) -> list[tuple[Track, int]]:
    pool = tracks[:40]
    # Spread the lookups across the playlist rather than only its opening songs.
    step = max(1, len(pool) // CANDIDATES)
    picks = pool[::step][:CANDIDATES]
    with ThreadPoolExecutor(max_workers=CANDIDATES) as ex:
        views = list(ex.map(lambda t: _views(t.source_id), picks))
    return sorted(zip(picks, views, strict=True), key=lambda p: -p[1])


def best_part(mono: np.ndarray, rate: int, seconds: float = CLIP_SECONDS) -> float:
    """Start time (s) of the loudest sustained stretch, eased back to a phrase start."""
    n = len(mono)
    length = int(seconds * rate)
    if n <= length:
        return 0.0
    hop = int(0.1 * rate)
    frames = max(1, n // hop)
    energy = np.array([float(np.mean(mono[i * hop : (i + 1) * hop] ** 2)) for i in range(frames)])
    span = int(seconds / 0.1)
    cumulative = np.concatenate([[0.0], np.cumsum(energy)])
    lo = int(0.08 * frames)
    hi = max(lo + 1, frames - span - int(0.04 * frames))
    windows = [(cumulative[s + span] - cumulative[s]) / span for s in range(lo, hi)]
    start = lo + int(np.argmax(windows)) if windows else 0
    # Ease back up to 1.5 s to the quietest moment: a phrase or bar boundary.
    back = max(0, start - 15)
    start = back + int(np.argmin(energy[back : start + 1]))
    return start * 0.1


def _write_wav(path: Path, stereo: np.ndarray, rate: int) -> None:
    pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2").T.copy()
    tmp = path.with_suffix(".tmp")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    tmp.replace(path)


def prepare(db: Session, user_id: uuid.UUID) -> ClipMeta | None:
    """The listener's clip, made if needed. None when they have no analysed music."""
    songs = _songs(db, user_id)
    if songs is None:
        return None
    submission_id, tracks = songs
    hit = cached(user_id, submission_id)
    if hit is not None:
        return hit
    clip_dir().mkdir(parents=True, exist_ok=True)
    for track, views in _most_famous(tracks):
        work = Path(tempfile.mkdtemp(prefix="clip-", dir=clip_dir()))
        try:
            audio = download_audio(track.source_id, work)
            signal = decode_audio(audio.path, sample_rate=SAMPLE_RATE, max_seconds=12 * 60)
            stereo = signal.samples.astype(np.float64)
            start = best_part(stereo.mean(axis=0), SAMPLE_RATE)
            a = int(start * SAMPLE_RATE)
            part = stereo[:, a : a + int(CLIP_SECONDS * SAMPLE_RATE)]
            rms = float(np.sqrt(np.mean(part**2))) or 1e-9
            part = part * (10 ** (TARGET_RMS_DB / 20) / rms)
            peak = float(np.max(np.abs(part))) or 1.0
            if peak > 0.97:
                part = part * (0.97 / peak)
            fade = int(0.25 * SAMPLE_RATE)
            ramp = np.linspace(0.0, 1.0, fade)
            part[:, :fade] *= ramp
            part[:, -fade:] *= ramp[::-1]
            wav, meta_path = _paths(user_id)
            _write_wav(wav, part, SAMPLE_RATE)
            meta = ClipMeta(
                title=track.title or "",
                artist=track.channel or "",
                video_id=track.source_id,
                start_s=round(start, 1),
                duration_s=round(part.shape[1] / SAMPLE_RATE, 2),
                view_count=views or None,
                submission_id=submission_id,
                made_at=time.time(),
            )
            meta_path.write_text(json.dumps(meta.model_dump()), encoding="utf-8")
            return meta
        except Exception as exc:
            log.info("tuning clip: %s failed (%s); trying the next song", track.source_id, exc)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    return None
