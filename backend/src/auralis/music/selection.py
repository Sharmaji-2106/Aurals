"""Metadata-level track selection before anything is downloaded.

Cheap filters first: unavailable items, wrong durations, repeated songs, audio that
was deliberately altered, then even sampling if a playlist is larger than we analyse.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from auralis.music.youtube import TrackMeta

_BRACKETED_NOISE = re.compile(
    r"[\(\[][^\)\]]*\b(official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|remaster(ed)?|"
    r"explicit|clean|m/?v)\b[^\)\]]*[\)\]]",
    re.IGNORECASE,
)
_LOOSE_NOISE = re.compile(
    r"\b(official|music video|lyric video|lyrics|audio|hd|hq|4k)\b", re.IGNORECASE
)
_CHANNEL_NOISE = re.compile(r"(vevo|official|\s-\stopic)$", re.IGNORECASE)
# Uploads whose audio was deliberately transformed; they misrepresent the recording.
_ALTERED = re.compile(
    r"\b(sped\s*up|speed\s*up|slowed|nightcore|8d\s*audio|bass\s*boost(ed)?|daycore|"
    r"\d+\s*hours?\s+(loop|version))\b",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class Candidate:
    meta: TrackMeta
    source_index: int  # which submission source it came from


@dataclass(frozen=True, slots=True)
class Decision:
    candidate: Candidate
    selected: bool
    reason: str | None  # why it was skipped


def title_key(title: str | None, channel: str | None) -> str | None:
    if not title:
        return None
    text = _LOOSE_NOISE.sub(" ", _BRACKETED_NOISE.sub(" ", title.lower()))
    artist = _CHANNEL_NOISE.sub("", (channel or "").lower()).strip()
    if " - " not in title and artist:
        text = f"{artist} {text}"
    key = re.sub(r"[\W_]+", " ", text).strip()
    return key or None


def is_altered(title: str | None) -> bool:
    return bool(title and _ALTERED.search(title))


def evenly_spaced(n: int, k: int) -> list[int]:
    if k >= n:
        return list(range(n))
    if k <= 1:
        return [0][:k]
    return sorted({round(i * (n - 1) / (k - 1)) for i in range(k)})


def select(
    candidates: Sequence[Candidate], *, min_seconds: float, max_seconds: float, max_tracks: int
) -> list[Decision]:
    decisions: list[Decision] = []
    seen_ids: set[str] = set()
    seen_titles: set[str] = set()
    eligible: list[int] = []
    for cand in candidates:
        meta = cand.meta
        if meta.video_id in seen_ids:
            continue  # exact repeats are dropped silently; they're the same track
        seen_ids.add(meta.video_id)
        reason = meta.unavailable_reason
        if reason is None and meta.duration_s is not None:
            if meta.duration_s < min_seconds:
                reason = "too_short"
            elif meta.duration_s > max_seconds:
                reason = "too_long"
        if reason is None and is_altered(meta.title):
            reason = "altered_version"
        key = title_key(meta.title, meta.channel)
        if reason is None and key is not None:
            if key in seen_titles:
                reason = "duplicate"
            seen_titles.add(key)
        decisions.append(Decision(cand, selected=reason is None, reason=reason))
        if reason is None:
            eligible.append(len(decisions) - 1)

    keep = {eligible[i] for i in evenly_spaced(len(eligible), max_tracks)}
    return [
        d if (not d.selected or i in keep) else Decision(d.candidate, False, "sampled_out")
        for i, d in enumerate(decisions)
    ]
