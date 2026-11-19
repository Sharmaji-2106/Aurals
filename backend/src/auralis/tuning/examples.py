"""The questionnaire's listening examples, cut from the listener's own songs.

Each tonal question ("how much bass do you enjoy?", "where should vocals sit?",
"how do bright highs feel?", …) gets its own example: a different song from the
listener's analysed playlist, chosen because it shows off what is being asked,
and the stretch of it that shows it off most —

- bass questions: the song whose spectrum carries the most low end relative to
  its mids, at its heaviest 15 seconds (the drop, the breakdown);
- vocals: the song with the most upper-midrange presence, where the voice band
  stands furthest above the rest of the mix (a verse or chorus, not a solo);
- treble: the brightest song, at its brightest stretch (cymbals, hats);
- overall tone: the loudest sustained stretch of a song not used above.

The browser applies the question's two treatments (lighter/fuller bass, …) to
the clip, loudness-matched, so the listener hears the difference on music they
know. The clips illustrate the question; they never set or weight an answer.

Storage is the duel clip's: personal, under the project cache, one manifest per
listener, replaced when their music changes, expired after 24 hours, deleted
with their account. Nothing else of the audio is kept. Choosing the songs uses
the spectra the analysis already stored; only the chosen songs are fetched.
"""

from __future__ import annotations

import json
import logging
import shutil
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.analysis.decode import decode_audio
from auralis.analysis.version import ANALYZER_VERSION
from auralis.music.models import Track, TrackAnalysis
from auralis.music.youtube import download_audio
from auralis.tuning.clip import (
    EXPIRY_S,
    SAMPLE_RATE,
    TARGET_RMS_DB,
    _songs,
    _write_wav,
    best_part,
    clip_dir,
)

log = logging.getLogger(__name__)

EXAMPLE_SECONDS = 15.0

#: The questions with a listening example, the part of the spectrum each is about
#: (Hz), and the order songs are handed out in: the most specific first.
FOCUS: dict[str, tuple[float, float] | None] = {
    "bass_amount": (30.0, 150.0),
    "vocals": (1000.0, 4000.0),
    "treble_feel": (5000.0, 14000.0),
    "bass_character": (30.0, 150.0),
    "tone": None,
}
#: What a focus band is compared against, to find songs and moments where it stands out.
REFERENCE_BAND = (200.0, 4000.0)


class Example(BaseModel):
    question: str
    title: str
    artist: str
    video_id: str
    start_s: float
    duration_s: float


class ExampleSet(BaseModel):
    submission_id: str
    made_at: float
    items: list[Example]


def _manifest(user_id: uuid.UUID) -> Path:
    return clip_dir() / f"{user_id}-examples.json"


def example_path(user_id: uuid.UUID, question: str) -> Path | None:
    if question not in FOCUS:
        return None
    path = clip_dir() / f"{user_id}-ex-{question}.wav"
    if not path.exists() or time.time() - path.stat().st_mtime > EXPIRY_S:
        return None
    return path


def delete_examples(user_id: uuid.UUID) -> None:
    _manifest(user_id).unlink(missing_ok=True)
    for question in FOCUS:
        (clip_dir() / f"{user_id}-ex-{question}.wav").unlink(missing_ok=True)


def cached(user_id: uuid.UUID, submission_id: str | None = None) -> ExampleSet | None:
    path = _manifest(user_id)
    if not path.exists():
        return None
    found = ExampleSet.model_validate_json(path.read_text(encoding="utf-8"))
    stale = time.time() - found.made_at > EXPIRY_S
    moved = submission_id is not None and found.submission_id != submission_id
    if stale or moved:
        delete_examples(user_id)
        return None
    return found


def _band(freqs: np.ndarray, db: np.ndarray, lo: float, hi: float) -> float:
    mask = (freqs >= lo) & (freqs < hi)
    return float(np.mean(db[mask])) if mask.any() else float("nan")


def _song_scores(db: Session, tracks: list[Track]) -> dict[str, dict[str, float]]:
    """Per track and question, how much the focus band stands out of its mix (dB)."""
    rows = db.execute(
        select(TrackAnalysis.track_id, TrackAnalysis.features).where(
            TrackAnalysis.track_id.in_([t.id for t in tracks]),
            TrackAnalysis.analyzer_version == ANALYZER_VERSION,
            TrackAnalysis.status == "succeeded",
        )
    ).all()
    scores: dict[str, dict[str, float]] = {}
    for track_id, features in rows:
        spectrum = (features or {}).get("spectrum_db")
        freqs = (features or {}).get("spectrum_freqs_hz")
        if not spectrum or not freqs or len(spectrum) != len(freqs):
            continue
        f = np.asarray(freqs, dtype=float)
        s = np.asarray(spectrum, dtype=float)
        reference = _band(f, s, *REFERENCE_BAND)
        out: dict[str, float] = {}
        for question, band in FOCUS.items():
            if band is not None:
                out[question] = _band(f, s, *band) - reference
        scores[str(track_id)] = out
    return scores


def choose_songs(tracks: list[Track], scores: dict[str, dict[str, float]]) -> dict[str, Track]:
    """One song per question, each the playlist's best showcase not already used."""
    chosen: dict[str, Track] = {}
    used: set[str] = set()
    scored = [t for t in tracks if str(t.id) in scores]
    for question, band in FOCUS.items():
        if band is None:
            ranked = scored or tracks
        else:
            ranked = sorted(scored, key=lambda t: -scores[str(t.id)].get(question, float("-inf")))
        if not ranked:
            continue
        pick = next((t for t in ranked if str(t.id) not in used), ranked[0])
        chosen[question] = pick
        used.add(str(pick.id))
    return chosen


def focus_part(mono: np.ndarray, rate: int, band: tuple[float, float] | None) -> float:
    """Start (s) of the stretch where the focus band is strongest against the mix."""
    if band is None:
        return best_part(mono, rate, EXAMPLE_SECONDS)
    n = len(mono)
    length = int(EXAMPLE_SECONDS * rate)
    if n <= length:
        return 0.0
    hop = int(0.1 * rate)
    size = 4096
    window = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / rate)
    in_band = (freqs >= band[0]) & (freqs < band[1])
    in_ref = (freqs >= REFERENCE_BAND[0]) & (freqs < REFERENCE_BAND[1])
    frames = (n - size) // hop
    focus = np.zeros(frames)
    loud = np.zeros(frames)
    for i in range(frames):
        chunk = mono[i * hop : i * hop + size] * window
        power = np.abs(np.fft.rfft(chunk)) ** 2
        focus[i] = power[in_band].sum()
        loud[i] = power[in_ref].sum() + focus[i]
    span = int(EXAMPLE_SECONDS / 0.1)
    lo = int(0.06 * frames)
    hi = max(lo + 1, frames - span - int(0.03 * frames))
    if hi <= lo:
        return 0.0
    cf = np.concatenate([[0.0], np.cumsum(focus)])
    cl = np.concatenate([[0.0], np.cumsum(loud)])
    # Where the band is strong in its own right and stands out of a mix that is
    # actually playing (not a quiet intro where a lone bass note dominates).
    starts = np.arange(lo, hi)
    band_energy = (cf[starts + span] - cf[starts]) / span
    total = (cl[starts + span] - cl[starts]) / span
    level = total / (np.max(total) or 1.0)
    score = np.log10(band_energy + 1e-12) + np.log10(level + 1e-6)
    start = int(starts[int(np.argmax(score))])
    # Ease back to a quiet moment, as the duel clip does, to start on a phrase.
    energy = loud / (np.max(loud) or 1.0)
    back = max(0, start - 15)
    start = back + int(np.argmin(energy[back : start + 1]))
    return start * 0.1


def _cut(audio_path: Path, band: tuple[float, float] | None) -> tuple[np.ndarray, float]:
    signal = decode_audio(audio_path, sample_rate=SAMPLE_RATE, max_seconds=12 * 60)
    stereo = signal.samples.astype(np.float64)
    start = focus_part(stereo.mean(axis=0), SAMPLE_RATE, band)
    a = int(start * SAMPLE_RATE)
    part = stereo[:, a : a + int(EXAMPLE_SECONDS * SAMPLE_RATE)]
    rms = float(np.sqrt(np.mean(part**2))) or 1e-9
    part = part * (10 ** (TARGET_RMS_DB / 20) / rms)
    peak = float(np.max(np.abs(part))) or 1.0
    if peak > 0.97:
        part = part * (0.97 / peak)
    fade = int(0.25 * SAMPLE_RATE)
    ramp = np.linspace(0.0, 1.0, fade)
    part[:, :fade] *= ramp
    part[:, -fade:] *= ramp[::-1]
    return part, start


def prepare_examples(db: Session, user_id: uuid.UUID) -> ExampleSet | None:
    """Every question's example for this listener, made if needed."""
    songs = _songs(db, user_id)
    if songs is None:
        return None
    submission_id, tracks = songs
    hit = cached(user_id, submission_id)
    if hit is not None:
        return hit
    chosen = choose_songs(tracks, _song_scores(db, tracks))
    if not chosen:
        return None
    clip_dir().mkdir(parents=True, exist_ok=True)

    # Each song is fetched once, however many questions it serves.
    by_video: dict[str, list[str]] = {}
    meta: dict[str, Track] = {}
    for question, track in chosen.items():
        by_video.setdefault(track.source_id, []).append(question)
        meta[track.source_id] = track

    def make(video_id: str) -> list[Example]:
        work = Path(tempfile.mkdtemp(prefix="ex-", dir=clip_dir()))
        made: list[Example] = []
        try:
            audio = download_audio(video_id, work)
            for question in by_video[video_id]:
                part, start = _cut(audio.path, FOCUS[question])
                _write_wav(clip_dir() / f"{user_id}-ex-{question}.wav", part, SAMPLE_RATE)
                track = meta[video_id]
                made.append(
                    Example(
                        question=question,
                        title=track.title or "",
                        artist=track.channel or "",
                        video_id=video_id,
                        start_s=round(start, 1),
                        duration_s=round(part.shape[1] / SAMPLE_RATE, 2),
                    )
                )
        except Exception as exc:  # one song failing must not lose the others
            log.info("listening example: %s failed (%s)", video_id, exc)
        finally:
            shutil.rmtree(work, ignore_errors=True)
        return made

    with ThreadPoolExecutor(max_workers=3) as pool:
        items = [e for batch in pool.map(make, list(by_video)) for e in batch]
    if not items:
        return None
    order = list(FOCUS)
    found = ExampleSet(
        submission_id=submission_id,
        made_at=time.time(),
        items=sorted(items, key=lambda e: order.index(e.question)),
    )
    _manifest(user_id).write_text(json.dumps(found.model_dump()), encoding="utf-8")
    return found


Status = Literal["ready", "preparing", "none"]


def status(db: Session, user_id: uuid.UUID) -> tuple[Status, list[Example]]:
    """What the questionnaire can play: ready examples, or why there are none yet."""
    songs = _songs(db, user_id)
    if songs is None:
        return "none", []
    found = cached(user_id, songs[0])
    if found is None:
        return "preparing", []
    return "ready", found.items
