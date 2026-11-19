"""Strict parsing of user-supplied music URLs.

User input is reduced to a (kind, id) pair and never forwarded to yt-dlp as-is:
downstream code only ever sees canonical URLs we construct ourselves. That rules out
SSRF through yt-dlp's hundreds of other extractors and odd URL tricks. Spotify links
are parsed by :mod:`auralis.music.spotify` under the same rule and dispatched here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlsplit

from auralis.music.spotify import SPOTIFY_HOSTS, SpotifyRef, parse_spotify_url

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{2,64}$")
YOUTUBE_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
    }
)
SHORT_HOSTS = frozenset({"youtu.be", "www.youtu.be"})
# Account-bound lists (Watch Later, Liked videos, Liked music) need the user's login.
PRIVATE_LISTS = frozenset({"WL", "LL", "LM"})
MAX_URL_LENGTH = 2048


class InvalidYouTubeUrl(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class YouTubeRef:
    kind: Literal["video", "playlist"]
    id: str
    # A video link copied from inside a playlist carries that playlist's id as a hint.
    playlist_hint: str | None = None

    @property
    def canonical_url(self) -> str:
        if self.kind == "video":
            return f"https://www.youtube.com/watch?v={self.id}"
        return f"https://www.youtube.com/playlist?list={self.id}"


def _playlist(list_id: str) -> YouTubeRef:
    if list_id in PRIVATE_LISTS:
        raise InvalidYouTubeUrl(
            "private_playlist",
            "That list is tied to your YouTube account. "
            "Make a public or unlisted copy and paste its link.",
        )
    if list_id.startswith("RD"):
        raise InvalidYouTubeUrl(
            "mix_playlist",
            "Auto-generated mixes are endless. Paste a regular playlist or individual songs.",
        )
    if not PLAYLIST_ID.match(list_id):
        raise InvalidYouTubeUrl("invalid_id", "That playlist link looks malformed.")
    return YouTubeRef("playlist", list_id)


def parse_youtube_url(raw: str) -> YouTubeRef:
    text = raw.strip()
    if not text:
        raise InvalidYouTubeUrl("empty", "Paste a YouTube link.")
    if len(text) > MAX_URL_LENGTH:
        raise InvalidYouTubeUrl("too_long", "That link is too long.")
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text):
        text = "https://" + text

    parts = urlsplit(text)
    if parts.scheme.lower() not in {"http", "https"}:
        raise InvalidYouTubeUrl("unsupported_scheme", "Only http(s) YouTube links are supported.")
    try:
        port = parts.port
    except ValueError:  # e.g. "javascript:alert(1)" parsed as host:port
        port = -1
    if parts.username or parts.password or port not in (None, 80, 443):
        raise InvalidYouTubeUrl("unsupported_host", "Only YouTube links are supported.")
    host = (parts.hostname or "").lower().rstrip(".")
    query = parse_qs(parts.query)
    segments = [s for s in parts.path.split("/") if s]

    def first(name: str) -> str | None:
        values = query.get(name)
        return values[0] if values else None

    video_id: str | None = None
    if host in SHORT_HOSTS:
        video_id = segments[0] if segments else None
    elif host in YOUTUBE_HOSTS:
        if segments[:1] == ["watch"] or (not segments and first("v")):
            video_id = first("v")
        elif segments[:1] == ["playlist"]:
            list_id = first("list")
            if not list_id:
                raise InvalidYouTubeUrl("invalid_id", "That playlist link has no playlist id.")
            return _playlist(list_id)
        elif len(segments) >= 2 and segments[0] in {"shorts", "live", "embed", "v", "e"}:
            video_id = segments[1]
        elif segments and (segments[0].startswith("@") or segments[0] in {"channel", "c", "user"}):
            raise InvalidYouTubeUrl(
                "channel_url", "Channel links aren't supported yet. Paste a playlist or songs."
            )
        else:
            raise InvalidYouTubeUrl(
                "unsupported_path", "Paste a link to a YouTube video or playlist."
            )
    else:
        raise InvalidYouTubeUrl("unsupported_host", "Only YouTube links are supported.")

    if not video_id or not VIDEO_ID.match(video_id):
        raise InvalidYouTubeUrl("invalid_id", "That video link looks malformed.")
    list_id = first("list")
    hint = (
        list_id if list_id and PLAYLIST_ID.match(list_id) and list_id not in PRIVATE_LISTS else None
    )
    if hint and hint.startswith("RD"):
        hint = None
    return YouTubeRef("video", video_id, playlist_hint=hint)


MusicRef = YouTubeRef | SpotifyRef


def _looks_like_spotify(raw: str) -> bool:
    text = raw.strip()
    if text.lower().startswith("spotify:"):
        return True
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text):
        text = "https://" + text
    try:
        host = (urlsplit(text).hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    return host in SPOTIFY_HOSTS


def parse_music_url(raw: str) -> MusicRef:
    """Route a pasted link to the parser that owns it.

    Dispatching on the host first means a Spotify link is never reported with a
    YouTube parser's wording, and neither parser has to loosen its own rules.
    """
    return parse_spotify_url(raw) if _looks_like_spotify(raw) else parse_youtube_url(raw)
