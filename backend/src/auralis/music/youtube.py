"""YouTube access through yt-dlp: metadata resolution and temporary audio download.

Only :class:`~auralis.music.urls.YouTubeRef` canonical URLs reach yt-dlp, and
extraction is restricted to YouTube extractors.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadError

from auralis.config import get_settings
from auralis.music.urls import VIDEO_ID, YouTubeRef

log = logging.getLogger(__name__)

MAX_PLAYLIST_ENTRIES = 500


class YouTubeError(Exception):
    """A classified yt-dlp failure. ``retryable`` failures may succeed later."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class TrackMeta:
    video_id: str
    title: str | None
    channel: str | None
    duration_s: float | None
    unavailable_reason: str | None = None


@dataclass(frozen=True, slots=True)
class ResolvedSource:
    ref: YouTubeRef
    title: str | None
    channel: str | None
    tracks: list[TrackMeta]
    total_entries: int | None


@dataclass(frozen=True, slots=True)
class DownloadedAudio:
    path: Path
    meta: TrackMeta
    codec: str | None
    bitrate_kbps: float | None


class _YtdlpLogger:
    def debug(self, msg: str) -> None:
        if not msg.startswith("[debug] "):
            log.debug(msg)

    def info(self, msg: str) -> None:
        log.debug(msg)

    def warning(self, msg: str) -> None:
        log.info("yt-dlp: %s", msg)

    def error(self, msg: str) -> None:
        log.info("yt-dlp: %s", msg)


def _base_options() -> dict[str, Any]:
    settings = get_settings()
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _YtdlpLogger(),
        "allowed_extractors": [r"youtube(:tab)?$"],
        "socket_timeout": 20,
        "retries": 3,
        "extractor_retries": 2,
        "cachedir": str(settings.work_dir / "yt-dlp-cache"),
    }
    runtime = settings.resolved_js_runtime()
    if runtime:
        opts["js_runtimes"] = {runtime: {}}
    return opts


_CLASSIFIERS: tuple[tuple[str, str, bool], ...] = (
    ("private video", "private", False),
    ("video unavailable", "unavailable", False),
    ("has been removed", "unavailable", False),
    ("this video is not available", "unavailable", False),
    ("confirm your age", "age_restricted", False),
    ("inappropriate for some users", "age_restricted", False),
    ("not available in your country", "geo_blocked", False),
    ("members-only", "members_only", False),
    ("join this channel", "members_only", False),
    ("premieres in", "not_yet_available", False),
    ("live event will begin", "not_yet_available", False),
    ("playlist does not exist", "playlist_not_found", False),
    ("the playlist does not exist", "playlist_not_found", False),
    ("not a bot", "bot_check", True),
    ("http error 403", "forbidden", True),
    ("http error 429", "rate_limited", True),
    ("timed out", "network", True),
    ("connection", "network", True),
)


def classify(exc: Exception) -> YouTubeError:
    text = str(exc).lower()
    for needle, code, retryable in _CLASSIFIERS:
        if needle in text:
            return YouTubeError(code, str(exc), retryable=retryable)
    return YouTubeError("extractor_error", str(exc), retryable=True)


def _entry_meta(entry: dict[str, Any]) -> TrackMeta | None:
    video_id = entry.get("id")
    if not isinstance(video_id, str) or not VIDEO_ID.match(video_id):
        return None
    title = entry.get("title")
    reason = None
    if title in {"[Private video]", "[Deleted video]"}:
        reason = "private" if "Private" in title else "unavailable"
    elif entry.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
        reason = "live"
    duration = entry.get("duration")
    return TrackMeta(
        video_id=video_id,
        title=title if reason is None else None,
        channel=entry.get("channel") or entry.get("uploader"),
        duration_s=float(duration) if isinstance(duration, int | float) else None,
        unavailable_reason=reason,
    )


def resolve(ref: YouTubeRef) -> ResolvedSource:
    """Fetch source metadata and its track list without downloading media."""
    opts = {
        **_base_options(),
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": MAX_PLAYLIST_ENTRIES,
        "noplaylist": ref.kind == "video",
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(ref.canonical_url, download=False)
    except DownloadError as exc:
        raise classify(exc) from exc
    if not isinstance(info, dict):
        raise YouTubeError("extractor_error", "unexpected metadata response", retryable=True)

    if ref.kind == "video":
        meta = _entry_meta(info)
        if meta is None:
            raise YouTubeError("extractor_error", "video metadata missing id")
        return ResolvedSource(ref, meta.title, meta.channel, [meta], 1)

    tracks = [m for e in info.get("entries") or [] if isinstance(e, dict) and (m := _entry_meta(e))]
    total = info.get("playlist_count")
    return ResolvedSource(
        ref=ref,
        title=info.get("title"),
        channel=info.get("channel") or info.get("uploader"),
        tracks=tracks,
        total_entries=int(total) if isinstance(total, int) else len(tracks),
    )


# YouTube player clients to fall back through when a stream URL is refused.
#
# A 403 on "unable to download video data" means the stream address yt-dlp was
# handed for one client was rejected (an expired or unsigned URL, a client that
# now needs a proof-of-origin token). Retrying the same client gets the same
# answer, which is how tracks were lost; asking as a different client usually
# gets a stream that downloads. `None` is yt-dlp's own default choice.
_FALLBACK_CLIENTS: tuple[tuple[str, ...] | None, ...] = (
    None,
    ("android_vr",),
    ("tv_simply",),
    ("mweb",),
)


def _forbidden(exc: DownloadError) -> bool:
    text = str(exc).lower()
    return "http error 403" in text or "requested format is not available" in text


def download_audio(
    video_id: str, dest_dir: Path, *, audio_format: str = "bestaudio/best"
) -> DownloadedAudio:
    """Download the best audio-only stream into ``dest_dir`` (caller deletes it)."""
    if not VIDEO_ID.match(video_id):
        raise ValueError("invalid video id")
    settings = get_settings()
    ref = YouTubeRef("video", video_id)
    base = {
        **_base_options(),
        "format": audio_format,
        "noplaylist": True,
        "max_filesize": settings.max_download_bytes,
        "paths": {"home": str(dest_dir), "temp": str(dest_dir)},
        "outtmpl": {"default": "%(id)s.%(ext)s"},
        "overwrites": True,
        "nopart": True,
        # Smaller ranged requests: throttled streams answer 403 to one long read.
        "http_chunk_size": 10 * 1024 * 1024,
        "match_filter": _duration_filter(settings.max_track_seconds),
    }
    info: Any = None
    for i, clients in enumerate(_FALLBACK_CLIENTS):
        opts = dict(base)
        if clients:
            opts["extractor_args"] = {"youtube": {"player_client": list(clients)}}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(ref.canonical_url, download=True)
            break
        except DownloadError as exc:
            for leftover in dest_dir.glob(f"{video_id}*"):
                leftover.unlink(missing_ok=True)
            if not _forbidden(exc) or i == len(_FALLBACK_CLIENTS) - 1:
                raise classify(exc) from exc
            log.info(
                "yt-dlp: %s refused for client %s; trying %s",
                video_id,
                ",".join(clients) if clients else "default",
                ",".join(_FALLBACK_CLIENTS[i + 1] or ()),
            )
    if not isinstance(info, dict):
        raise YouTubeError("extractor_error", "unexpected download response", retryable=True)
    meta = _entry_meta(info)
    if meta is None:
        raise YouTubeError("extractor_error", "download metadata missing id")
    if meta.unavailable_reason:
        raise YouTubeError(meta.unavailable_reason, f"video is {meta.unavailable_reason}")

    files = [p for p in dest_dir.iterdir() if p.is_file() and p.name.startswith(video_id)]
    if not files:
        # yt-dlp skips (without raising) when a filter or size limit rejects the video.
        if meta.duration_s and meta.duration_s > settings.max_track_seconds:
            raise YouTubeError("too_long", "track is longer than the analysis limit")
        raise YouTubeError("too_large", "audio stream exceeds the download size limit")
    abr = info.get("abr")
    return DownloadedAudio(
        path=files[0],
        meta=meta,
        codec=info.get("acodec"),
        bitrate_kbps=float(abr) if isinstance(abr, int | float) else None,
    )


def _duration_filter(max_seconds: int) -> Any:
    def check(info: dict[str, Any], *, incomplete: bool) -> str | None:
        duration = info.get("duration")
        if isinstance(duration, int | float) and duration > max_seconds:
            return "longer than the analysis limit"
        if info.get("live_status") in {"is_live", "is_upcoming"}:
            return "live streams can't be analysed"
        return None

    return check


SEARCH_RESULTS = 5
# Roughly the gap between a single edit and an album cut of the same song.
DURATION_TOLERANCE_S = 7.0
# Words that mark a different performance of the same title. They only count
# against a candidate when the query did not ask for them.
_VARIANTS = (
    "live",
    "cover",
    "remix",
    "karaoke",
    "instrumental",
    "acoustic",
    "reaction",
    "sped up",
    "slowed",
    "nightcore",
    "8d audio",
    "lyrics video",
    "tutorial",
)
_TOKENS = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True, slots=True)
class SearchMatch:
    """The YouTube video chosen for a track that came from somewhere else."""

    meta: TrackMeta
    score: float
    confident: bool
    note: str


def _words(text: str) -> set[str]:
    return set(_TOKENS.findall(text.lower()))


def _rate(query: str, meta: TrackMeta, want_seconds: float | None) -> tuple[float, bool, str]:
    asked = _words(query)
    found = _words(f"{meta.title or ''} {meta.channel or ''}")
    overlap = len(asked & found) / len(asked) if asked else 0.0

    gap = (
        abs((meta.duration_s or 0) - want_seconds)
        if want_seconds is not None and meta.duration_s is not None
        else None
    )
    closeness = 1.0 - min(1.0, gap / 30.0) if gap is not None else 0.5

    haystack = f"{meta.title or ''} {meta.channel or ''}".lower()
    variants = [v for v in _VARIANTS if v in haystack and v not in query.lower()]
    penalty = 0.22 * len(variants)

    score = max(0.0, 0.55 * overlap + 0.45 * closeness - penalty)
    confident = overlap >= 0.6 and not variants and gap is not None and gap <= DURATION_TOLERANCE_S
    if confident:
        note = "matched on title and length"
    elif variants:
        # Why it is the wrong recording matters more than by how much.
        note = f"closest result looks like a {variants[0]} version"
    elif gap is None:
        note = "matched on title; lengths could not be compared"
    elif gap > DURATION_TOLERANCE_S:
        way = "longer" if (meta.duration_s or 0) > (want_seconds or 0) else "shorter"
        note = f"closest result runs {gap:.0f}s {way}"
    else:
        note = "closest result, title only partly agrees"
    return score, confident, note


def search(query: str, *, want_seconds: float | None = None) -> SearchMatch | None:
    """Best YouTube video for a track title, or ``None`` when nothing came back.

    The query is built by Auralis from playlist metadata and handed to yt-dlp's own
    search extractor, so no user-supplied URL ever reaches it. The best candidate is
    always returned; ``confident`` says whether it agreed on both title and length,
    and that judgement travels with the track rather than being discarded.
    """
    text = " ".join(query.split())[:200]
    if not text:
        return None
    opts = {
        **_base_options(),
        "allowed_extractors": [r"youtube(:tab)?$", r"youtube:search$"],
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": SEARCH_RESULTS,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{SEARCH_RESULTS}:{text}", download=False)
    except DownloadError as exc:
        raise classify(exc) from exc
    if not isinstance(info, dict):
        return None

    rated: list[tuple[float, bool, str, TrackMeta]] = []
    for entry in info.get("entries") or []:
        if not isinstance(entry, dict):
            continue
        meta = _entry_meta(entry)
        if meta is None or meta.unavailable_reason is not None:
            continue
        score, confident, note = _rate(text, meta, want_seconds)
        rated.append((score, confident, note, meta))
    if not rated:
        return None
    score, confident, note, meta = max(rated, key=lambda row: row[0])
    return SearchMatch(meta=meta, score=round(score, 3), confident=confident, note=note)
