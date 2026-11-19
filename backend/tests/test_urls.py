import pytest

from auralis.music.urls import InvalidYouTubeUrl, YouTubeRef, parse_youtube_url

VIDEO = "5NV6Rdv1a3I"
PLAYLIST = "PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm"


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO}",
        f"http://youtube.com/watch?v={VIDEO}&t=42s",
        f"www.youtube.com/watch?feature=share&v={VIDEO}",
        f"https://m.youtube.com/watch?v={VIDEO}",
        f"https://music.youtube.com/watch?v={VIDEO}&si=abc",
        f"https://youtu.be/{VIDEO}?si=xyz",
        f"youtu.be/{VIDEO}",
        f"https://www.youtube.com/shorts/{VIDEO}",
        f"https://www.youtube.com/embed/{VIDEO}",
        f"https://www.youtube.com/live/{VIDEO}",
        f"  https://WWW.YOUTUBE.COM/watch?v={VIDEO}  ",
    ],
)
def test_video_urls(url: str) -> None:
    assert parse_youtube_url(url) == YouTubeRef("video", VIDEO)


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/playlist?list={PLAYLIST}",
        f"https://music.youtube.com/playlist?list={PLAYLIST}&si=1",
        f"youtube.com/playlist?list={PLAYLIST}",
    ],
)
def test_playlist_urls(url: str) -> None:
    ref = parse_youtube_url(url)
    assert ref == YouTubeRef("playlist", PLAYLIST)
    assert ref.canonical_url == f"https://www.youtube.com/playlist?list={PLAYLIST}"


def test_video_inside_playlist_keeps_hint() -> None:
    ref = parse_youtube_url(f"https://www.youtube.com/watch?v={VIDEO}&list={PLAYLIST}&index=3")
    assert ref.kind == "video"
    assert ref.playlist_hint == PLAYLIST


def test_video_inside_mix_has_no_hint() -> None:
    ref = parse_youtube_url(f"https://www.youtube.com/watch?v={VIDEO}&list=RD{VIDEO}")
    assert ref.kind == "video"
    assert ref.playlist_hint is None


@pytest.mark.parametrize(
    ("url", "code"),
    [
        ("", "empty"),
        ("https://vimeo.com/12345", "unsupported_host"),
        ("https://youtube.com.evil.example/watch?v=5NV6Rdv1a3I", "unsupported_host"),
        ("https://evil.example/?u=https://youtube.com/watch?v=5NV6Rdv1a3I", "unsupported_host"),
        ("https://user:pass@youtube.com/watch?v=5NV6Rdv1a3I", "unsupported_host"),
        ("https://youtube.com:8443/watch?v=5NV6Rdv1a3I", "unsupported_host"),
        ("file:///etc/passwd", "unsupported_scheme"),
        ("javascript:alert(1)", "unsupported_host"),
        ("https://www.youtube.com/watch?v=short", "invalid_id"),
        ("https://www.youtube.com/watch?v=5NV6Rdv1a3I%00", "invalid_id"),
        ("https://www.youtube.com/playlist", "invalid_id"),
        ("https://www.youtube.com/playlist?list=RDabcdef", "mix_playlist"),
        ("https://www.youtube.com/playlist?list=WL", "private_playlist"),
        ("https://www.youtube.com/playlist?list=LL", "private_playlist"),
        ("https://www.youtube.com/@somechannel", "channel_url"),
        ("https://www.youtube.com/channel/UC123", "channel_url"),
        ("https://www.youtube.com/results?search_query=x", "unsupported_path"),
        ("https://youtu.be/", "invalid_id"),
        ("https://www.youtube.com/watch?v=" + "a" * 3000, "too_long"),
    ],
)
def test_rejected_urls(url: str, code: str) -> None:
    with pytest.raises(InvalidYouTubeUrl) as exc:
        parse_youtube_url(url)
    assert exc.value.code == code
