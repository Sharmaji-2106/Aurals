"""Spotify playlist import: read the track list, then measure the songs on YouTube.

Auralis cannot measure Spotify audio. The service streams DRM-protected content, and
the 30-second clip in this payload is a preview, not the recording. So a Spotify
playlist contributes its *track list* only: each entry is matched to a YouTube video
and measured there, through exactly the same pipeline as a pasted YouTube playlist.

The track list comes from the document Spotify serves for a public playlist's embed
widget. That is an undocumented internal endpoint rather than the Web API, which
needs registered application credentials. It can change shape without notice, so
every parse step is guarded and every failure is classified instead of guessed
around. What it does not carry is recorded in :data:`EMBED_LIMITS`.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlsplit

log = logging.getLogger(__name__)

SPOTIFY_HOSTS = frozenset({"open.spotify.com", "play.spotify.com", "www.open.spotify.com"})
# Spotify ids are 22-character base62; accept a slightly wider range rather than
# rejecting a link that would have resolved.
SPOTIFY_ID = re.compile(r"^[A-Za-z0-9]{16,40}$")
MAX_URL_LENGTH = 2048
TIMEOUT_SECONDS = 12.0
MAX_BYTES = 4_000_000
# The embed document stops here however long the playlist is.
MAX_EMBED_TRACKS = 100

_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.DOTALL
)

#: What this import route cannot provide, stated once so callers never imply it can.
EMBED_LIMITS = (
    "the first 100 tracks of a playlist",
    "no album names and no per-track cover art (the playlist's own cover only)",
)


class InvalidSpotifyUrl(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class SpotifyError(Exception):
    """A classified failure reading a playlist. ``retryable`` may succeed later."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class SpotifyRef:
    kind: Literal["spotify_playlist"]
    id: str

    @property
    def canonical_url(self) -> str:
        return f"https://open.spotify.com/playlist/{self.id}"

    @property
    def embed_url(self) -> str:
        return f"https://open.spotify.com/embed/playlist/{self.id}"


@dataclass(frozen=True, slots=True)
class SpotifyTrack:
    track_id: str
    title: str
    artist: str | None
    duration_s: float | None
    playable: bool

    @property
    def query(self) -> str:
        """What to look for on YouTube. Artist first: it disambiguates covers."""
        return f"{self.artist} {self.title}".strip() if self.artist else self.title


@dataclass(frozen=True, slots=True)
class SpotifyPlaylist:
    ref: SpotifyRef
    name: str | None
    owner: str | None
    cover_url: str | None
    tracks: list[SpotifyTrack]
    truncated: bool


def parse_spotify_url(raw: str) -> SpotifyRef:
    """Reduce a user-supplied Spotify link to a playlist id, or refuse it.

    Mirrors the YouTube parser's posture: nothing but an id survives, and the URL we
    later fetch is rebuilt from that id rather than from anything the user typed.
    """
    text = raw.strip()
    if not text:
        raise InvalidSpotifyUrl("empty", "Paste a Spotify link.")
    if len(text) > MAX_URL_LENGTH:
        raise InvalidSpotifyUrl("too_long", "That link is too long.")

    # The desktop app's "Copy Spotify URI" gives spotify:playlist:<id>.
    if text.lower().startswith("spotify:"):
        parts = text.split(":")
        if len(parts) == 3 and parts[1].lower() == "playlist" and SPOTIFY_ID.match(parts[2]):
            return SpotifyRef("spotify_playlist", parts[2])
        raise InvalidSpotifyUrl("unsupported_path", "Only Spotify playlist links work here.")

    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text):
        text = "https://" + text
    parts_url = urlsplit(text)
    if parts_url.scheme.lower() not in {"http", "https"}:
        raise InvalidSpotifyUrl("unsupported_scheme", "Only http(s) Spotify links are supported.")
    try:
        port = parts_url.port
    except ValueError:
        port = -1
    if parts_url.username or parts_url.password or port not in (None, 80, 443):
        raise InvalidSpotifyUrl("unsupported_host", "Only Spotify links are supported.")
    if (parts_url.hostname or "").lower().rstrip(".") not in SPOTIFY_HOSTS:
        raise InvalidSpotifyUrl("unsupported_host", "Only Spotify links are supported.")

    segments = [s for s in parts_url.path.split("/") if s]
    # Localised links carry a country prefix: /intl-de/playlist/<id>.
    if segments and segments[0].startswith("intl-"):
        segments = segments[1:]
    if len(segments) >= 2 and segments[0] == "playlist":
        if not SPOTIFY_ID.match(segments[1]):
            raise InvalidSpotifyUrl("invalid_id", "That playlist link looks malformed.")
        return SpotifyRef("spotify_playlist", segments[1])
    if segments and segments[0] in {"album", "track", "artist", "show", "episode", "user"}:
        raise InvalidSpotifyUrl(
            "unsupported_path",
            f"Spotify {segments[0]} links aren't supported yet. Paste a playlist link.",
        )
    raise InvalidSpotifyUrl("unsupported_path", "Paste a link to a Spotify playlist.")


def _entity(document: str) -> dict[str, Any]:
    match = _NEXT_DATA.search(document)
    if not match:
        raise SpotifyError(
            "spotify_shape", "Spotify's page no longer carries the expected data block."
        )
    try:
        payload = json.loads(match.group(1))
    except ValueError as exc:
        raise SpotifyError("spotify_shape", f"Spotify returned data we can't read: {exc}") from exc
    entity = (
        payload.get("props", {}).get("pageProps", {}).get("state", {}).get("data", {}).get("entity")
    )
    if not isinstance(entity, dict):
        raise SpotifyError("spotify_shape", "Spotify's playlist data block has changed shape.")
    return entity


def _track(entry: Any) -> SpotifyTrack | None:
    if not isinstance(entry, dict):
        return None
    uri = entry.get("uri")
    title = entry.get("title")
    if not isinstance(uri, str) or not isinstance(title, str) or not title.strip():
        return None
    track_id = uri.rsplit(":", 1)[-1]
    if not SPOTIFY_ID.match(track_id):
        return None
    duration_ms = entry.get("duration")
    subtitle = entry.get("subtitle")
    return SpotifyTrack(
        track_id=track_id,
        title=title.strip()[:400],
        artist=subtitle.strip()[:200] if isinstance(subtitle, str) and subtitle.strip() else None,
        duration_s=duration_ms / 1000 if isinstance(duration_ms, int | float) else None,
        playable=entry.get("isPlayable") is not False,
    )


def _cover(entity: dict[str, Any]) -> str | None:
    sources = (entity.get("coverArt") or {}).get("sources")
    if not isinstance(sources, list):
        return None
    for source in sources:
        url = source.get("url") if isinstance(source, dict) else None
        # Only Spotify's own image host, so a changed payload can never point the
        # browser (or our image proxy) at an arbitrary origin.
        if isinstance(url, str) and url.startswith("https://i.scdn.co/image/"):
            return url
    return None


def fetch_playlist(ref: SpotifyRef) -> SpotifyPlaylist:
    """Read a public playlist's track list. Raises :class:`SpotifyError` on failure."""
    request = urllib.request.Request(  # noqa: S310 - fixed https host, validated id
        ref.embed_url,
        headers={
            # Spotify serves the embed document only to something browser-shaped.
            "User-Agent": "Mozilla/5.0 (compatible; Auralis/0.1)",
            "Accept": "text/html",
            "Accept-Language": "en",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            document = response.read(MAX_BYTES).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise SpotifyError(
                "spotify_not_found",
                "That playlist is private or no longer exists. AURALS can only read public ones.",
            ) from exc
        raise SpotifyError(
            "spotify_unavailable", f"Spotify returned {exc.code}.", retryable=exc.code >= 500
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SpotifyError(
            "spotify_unavailable", f"Couldn't reach Spotify: {exc}", retryable=True
        ) from exc

    entity = _entity(document)
    if entity.get("type") not in (None, "playlist"):
        raise SpotifyError("spotify_not_playlist", "That Spotify link isn't a playlist.")

    raw_tracks = entity.get("trackList")
    tracks = (
        [t for e in raw_tracks or [] if (t := _track(e))] if isinstance(raw_tracks, list) else []
    )
    if not tracks:
        raise SpotifyError(
            "spotify_empty",
            "That playlist has no readable tracks. Private and collaborative playlists "
            "can look empty from outside.",
        )

    name = entity.get("name") or entity.get("title")
    owner = entity.get("subtitle")
    return SpotifyPlaylist(
        ref=ref,
        name=str(name)[:400] if isinstance(name, str) else None,
        owner=str(owner)[:200] if isinstance(owner, str) and owner.strip() else None,
        cover_url=_cover(entity),
        tracks=tracks,
        truncated=len(tracks) >= MAX_EMBED_TRACKS,
    )
