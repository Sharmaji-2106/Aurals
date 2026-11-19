"""A refused stream is retried as another YouTube client, not given up on."""

from pathlib import Path
from typing import Any

import pytest
from yt_dlp.utils import DownloadError

from auralis.music import youtube


class _FakeYDL:
    calls: list[Any] = []
    refuse = 1

    def __init__(self, opts: dict[str, Any]) -> None:
        self.opts = opts

    def __enter__(self) -> "_FakeYDL":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def extract_info(self, url: str, download: bool) -> dict[str, Any]:
        clients = self.opts.get("extractor_args", {}).get("youtube", {}).get("player_client")
        _FakeYDL.calls.append(clients)
        if len(_FakeYDL.calls) <= _FakeYDL.refuse:
            raise DownloadError("ERROR: unable to download video data: HTTP Error 403: Forbidden")
        home = Path(self.opts["paths"]["home"])
        (home / "abcdefghijk.webm").write_bytes(b"audio")
        return {
            "id": "abcdefghijk",
            "title": "Song",
            "channel": "Artist",
            "duration": 200,
            "acodec": "opus",
            "abr": 128,
        }


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> type[_FakeYDL]:
    _FakeYDL.calls = []
    monkeypatch.setattr(youtube.yt_dlp, "YoutubeDL", _FakeYDL)
    return _FakeYDL


def test_a_403_falls_back_to_another_client(fake: type[_FakeYDL], tmp_path: Path) -> None:
    fake.refuse = 1
    audio = youtube.download_audio("abcdefghijk", tmp_path)
    assert audio.path.name == "abcdefghijk.webm"
    assert fake.calls == [None, ["android_vr"]]


def test_refused_by_every_client_is_a_retryable_forbidden(
    fake: type[_FakeYDL], tmp_path: Path
) -> None:
    fake.refuse = 99
    with pytest.raises(youtube.YouTubeError) as err:
        youtube.download_audio("abcdefghijk", tmp_path)
    assert err.value.code == "forbidden"
    assert err.value.retryable
    assert len(fake.calls) == len(youtube._FALLBACK_CLIENTS)
