"""Spotify link parsing, embed-payload reading and YouTube matching.

All offline: the embed document is a trimmed copy of the real one, so a change in
Spotify's payload shape fails here rather than in front of a user.
"""

import json

import pytest

from auralis.music import spotify, youtube
from auralis.music.spotify import InvalidSpotifyUrl, SpotifyRef, parse_spotify_url
from auralis.music.urls import InvalidYouTubeUrl, YouTubeRef, parse_music_url

PLAYLIST = "37i9dQZF1DXcBWIGoYBM5M"
TRACK = "3zOYmiNOuyDL0ClxJcEJ0T"


@pytest.mark.parametrize(
    "url",
    [
        f"https://open.spotify.com/playlist/{PLAYLIST}",
        f"https://open.spotify.com/playlist/{PLAYLIST}?si=8f0c1b2e",
        f"http://open.spotify.com/playlist/{PLAYLIST}",
        f"open.spotify.com/playlist/{PLAYLIST}",
        f"https://open.spotify.com/intl-de/playlist/{PLAYLIST}",
        f"https://play.spotify.com/playlist/{PLAYLIST}",
        f"spotify:playlist:{PLAYLIST}",
        f"  https://OPEN.SPOTIFY.COM/playlist/{PLAYLIST}  ",
    ],
)
def test_accepts_public_playlist_links(url: str) -> None:
    assert parse_spotify_url(url) == SpotifyRef("spotify_playlist", PLAYLIST)


@pytest.mark.parametrize(
    ("url", "code"),
    [
        ("", "empty"),
        ("https://open.spotify.com", "unsupported_path"),
        (f"https://open.spotify.com/album/{PLAYLIST}", "unsupported_path"),
        (f"https://open.spotify.com/track/{TRACK}", "unsupported_path"),
        ("https://open.spotify.com/playlist/short", "invalid_id"),
        (f"https://evil.example.com/playlist/{PLAYLIST}", "unsupported_host"),
        (f"https://user:pw@open.spotify.com/playlist/{PLAYLIST}", "unsupported_host"),
        (f"javascript:alert(1)//open.spotify.com/playlist/{PLAYLIST}", "unsupported_host"),
        (f"spotify:album:{PLAYLIST}", "unsupported_path"),
    ],
)
def test_rejects_everything_else(url: str, code: str) -> None:
    with pytest.raises(InvalidSpotifyUrl) as caught:
        parse_spotify_url(url)
    assert caught.value.code == code


def test_dispatcher_routes_by_host() -> None:
    assert parse_music_url(f"spotify:playlist:{PLAYLIST}").kind == "spotify_playlist"
    assert parse_music_url("https://youtu.be/5NV6Rdv1a3I") == YouTubeRef("video", "5NV6Rdv1a3I")
    # A Spotify link must never be reported in the YouTube parser's words.
    with pytest.raises(InvalidSpotifyUrl):
        parse_music_url(f"https://open.spotify.com/album/{PLAYLIST}")
    with pytest.raises(InvalidYouTubeUrl):
        parse_music_url("https://vimeo.com/123")


def _document(entity: dict) -> str:
    payload = {"props": {"pageProps": {"state": {"data": {"entity": entity}}}}}
    return (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></body></html>"
    )


ENTITY = {
    "type": "playlist",
    "name": "Today's Top Hits",
    "subtitle": "Spotify",
    "coverArt": {"sources": [{"url": "https://i.scdn.co/image/ab67706f0000000258fa"}]},
    "trackList": [
        {
            "uri": f"spotify:track:{TRACK}",
            "title": "Stop The Wedding!",
            "subtitle": "Ashe",
            "duration": 198840,
            "isPlayable": True,
        },
        {
            "uri": "spotify:track:7bxaFZ1O3cHkgLKMsdC3xR",
            "title": "Loser",
            "subtitle": "Tame Impala",
            "duration": 223069,
            "isPlayable": False,
        },
        {"uri": "not-a-uri", "title": "Broken entry"},
    ],
}


def test_reads_the_embed_payload() -> None:
    entity = spotify._entity(_document(ENTITY))
    tracks = [t for e in entity["trackList"] if (t := spotify._track(e))]
    assert [t.title for t in tracks] == ["Stop The Wedding!", "Loser"]
    first = tracks[0]
    assert first.track_id == TRACK
    assert first.artist == "Ashe"
    assert first.duration_s == pytest.approx(198.84)
    assert first.query == "Ashe Stop The Wedding!"
    # Unplayable entries are kept but flagged, never silently dropped here.
    assert tracks[1].playable is False
    assert spotify._cover(ENTITY) == "https://i.scdn.co/image/ab67706f0000000258fa"


def test_cover_art_must_come_from_spotifys_image_host() -> None:
    assert (
        spotify._cover({"coverArt": {"sources": [{"url": "https://evil.example/x.png"}]}}) is None
    )


def test_a_changed_payload_is_an_error_not_a_guess() -> None:
    with pytest.raises(spotify.SpotifyError) as caught:
        spotify._entity("<html><body>no data block</body></html>")
    assert caught.value.code == "spotify_shape"


def _meta(title: str, duration: float | None, channel: str = "Ashe") -> youtube.TrackMeta:
    return youtube.TrackMeta(video_id="A" * 11, title=title, channel=channel, duration_s=duration)


def test_a_matching_title_and_length_is_confident() -> None:
    score, confident, note = youtube._rate(
        "Ashe Stop The Wedding!", _meta("Ashe - Stop The Wedding! (Official Video)", 199.0), 198.8
    )
    assert confident is True
    assert score > 0.9
    assert note == "matched on title and length"


def test_a_different_performance_is_still_returned_but_not_confident() -> None:
    score, confident, note = youtube._rate(
        "Ashe Stop The Wedding!",
        _meta("Ashe - Stop The Wedding! (Live at Red Rocks)", 240.0),
        198.8,
    )
    assert confident is False
    assert "live" in note
    assert score > 0  # permissive: it is still the best answer we have


def test_an_unknown_length_is_reported_as_unknown() -> None:
    _, confident, note = youtube._rate(
        "Ashe Stop The Wedding!", _meta("Stop The Wedding!", None), 198.8
    )
    assert confident is False
    assert note == "matched on title; lengths could not be compared"
