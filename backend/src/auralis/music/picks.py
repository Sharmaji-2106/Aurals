"""Songs AURALS chooses when a listener has no playlist to hand.

A listener who names genres instead of pasting music gets a short list of
widely known songs from those genres (``data/music/genre-picks.json``: each a
real YouTube video, resolved and checked when the file was made), measured by
the same pipeline as anyone's playlist. The submission records that AURALS
chose them (``origin = "genre_picks"``), and every page that reads the result
says so: it describes those genres' music, not the listener's own.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

PICKS_PATH = Path(__file__).resolve().parents[4] / "data" / "music" / "genre-picks.json"
#: Songs per submission: enough for a stable reading, few enough to measure quickly.
MAX_SONGS = 12


@lru_cache(maxsize=2)
def _load(stamp: float) -> dict[str, list[dict[str, str]]]:
    del stamp
    data = json.loads(PICKS_PATH.read_text(encoding="utf-8"))
    return {genre: list(songs) for genre, songs in data["genres"].items()}


def picks() -> dict[str, list[dict[str, str]]]:
    try:
        return _load(PICKS_PATH.stat().st_mtime)
    except FileNotFoundError:
        return {}


def urls_for(genres: list[str]) -> list[str]:
    """Round-robin across the genres, so each is represented, up to ``MAX_SONGS``."""
    lists = [picks().get(g, []) for g in genres]
    out: list[str] = []
    for i in range(max((len(x) for x in lists), default=0)):
        for songs in lists:
            if i < len(songs) and len(out) < MAX_SONGS:
                out.append(f"https://www.youtube.com/watch?v={songs[i]['video_id']}")
    return out
