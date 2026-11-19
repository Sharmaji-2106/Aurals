"""Instant titles for pasted links via the platforms' public oEmbed endpoints.

Used only for display while the user is still editing their list. The request URL is
always built from a validated ID, results are cached briefly, and failures degrade to
"no preview" rather than errors.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from auralis.music.spotify import SpotifyRef
from auralis.music.urls import MusicRef, YouTubeRef

log = logging.getLogger(__name__)

OEMBED_URL = "https://www.youtube.com/oembed"
SPOTIFY_OEMBED_URL = "https://open.spotify.com/oembed"
TIMEOUT_SECONDS = 4.0
TTL_SECONDS = 6 * 3600
MAX_ENTRIES = 5000
_THUMB_ID = re.compile(r"/vi/([A-Za-z0-9_-]{11})/")


@dataclass(frozen=True, slots=True)
class LinkPreview:
    title: str | None
    author: str | None
    thumbnail_video_id: str | None
    available: bool
    # Set when the platform publishes artwork of its own rather than a video still.
    thumbnail_url: str | None = None


_cache: dict[str, tuple[float, LinkPreview]] = {}
_lock = threading.Lock()


def _fetch_spotify(ref: SpotifyRef) -> LinkPreview:
    query = urllib.parse.urlencode({"url": ref.canonical_url})
    request = urllib.request.Request(  # noqa: S310 - fixed https host, validated id
        f"{SPOTIFY_OEMBED_URL}?{query}", headers={"User-Agent": "Auralis/0.1"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            data = json.loads(response.read(64_000))
    except urllib.error.HTTPError as exc:
        # 404 here means private or deleted, which is an answer, not an outage.
        return LinkPreview(None, None, None, exc.code >= 500)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        log.info("Spotify oEmbed lookup failed for %s: %s", ref.id, exc)
        return LinkPreview(None, None, None, True)
    thumbnail = str(data.get("thumbnail_url") or "")
    return LinkPreview(
        title=str(data["title"])[:300] if data.get("title") else None,
        author=None,  # oEmbed does not name the playlist's owner
        thumbnail_video_id=None,
        available=True,
        thumbnail_url=thumbnail if thumbnail.startswith("https://i.scdn.co/image/") else None,
    )


def _fetch_youtube(ref: YouTubeRef) -> LinkPreview:
    query = urllib.parse.urlencode({"format": "json", "url": ref.canonical_url})
    request = urllib.request.Request(  # noqa: S310 - fixed https host, validated id
        f"{OEMBED_URL}?{query}", headers={"User-Agent": "Auralis/0.1"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            data = json.loads(response.read(64_000))
    except urllib.error.HTTPError as exc:
        # 400/401/404: private, removed or embedding disabled. Not an outage.
        return LinkPreview(None, None, ref.id if ref.kind == "video" else None, exc.code >= 500)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        log.info("oEmbed lookup failed for %s: %s", ref.id, exc)
        return LinkPreview(None, None, ref.id if ref.kind == "video" else None, True)
    thumb = _THUMB_ID.search(str(data.get("thumbnail_url") or ""))
    return LinkPreview(
        title=str(data["title"])[:300] if data.get("title") else None,
        author=str(data["author_name"])[:200] if data.get("author_name") else None,
        thumbnail_video_id=thumb.group(1) if thumb else None,
        available=True,
    )


def preview(ref: MusicRef) -> LinkPreview:
    key = f"{ref.kind}:{ref.id}"
    now = time.monotonic()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < TTL_SECONDS:
            return hit[1]
    result = _fetch_spotify(ref) if isinstance(ref, SpotifyRef) else _fetch_youtube(ref)
    with _lock:
        if len(_cache) >= MAX_ENTRIES:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (now, result)
    return result
