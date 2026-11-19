"""The music pipeline end to end, with YouTube replaced by deterministic fakes."""

from __future__ import annotations

import uuid
import zlib
from datetime import timedelta

import numpy as np
import pytest
from sqlalchemy import select

from auralis.analysis.features import TrackRejected
from auralis.db import session_scope
from auralis.jobs import queue
from auralis.jobs.models import Job
from auralis.jobs.worker import run_one
from auralis.music import acquire, youtube
from auralis.music.acquire import AcquiredAnalysis
from auralis.music.urls import YouTubeRef
from tests.factories import make_features

pytestmark = pytest.mark.db

PLAYLIST_ID = "PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm"


def video_id(i: int) -> str:
    return f"vid{i:08d}"


@pytest.fixture
def fake_youtube(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    calls = {"downloads": 0}
    tracks = [
        youtube.TrackMeta(video_id(i), f"Artist - Song {i}", "Artist", 200.0) for i in range(12)
    ]
    tracks.append(youtube.TrackMeta("private0000", None, None, None, "private"))
    tracks.append(youtube.TrackMeta(video_id(99), "Artist - Song 99 (sped up)", "Artist", 150.0))

    def resolve(ref: YouTubeRef) -> youtube.ResolvedSource:
        if ref.kind == "playlist":
            return youtube.ResolvedSource(ref, "Test playlist", "Tester", tracks, len(tracks))
        if ref.id == "missing0000":
            raise youtube.YouTubeError("unavailable", "Video unavailable")
        return youtube.ResolvedSource(
            ref,
            "Single",
            "Artist",
            [youtube.TrackMeta(ref.id, "Artist - Single", "Artist", 180.0)],
            1,
        )

    def fetch(vid: str) -> AcquiredAnalysis:
        calls["downloads"] += 1
        if vid == video_id(11):
            raise TrackRejected("silent", "track is silent")
        if vid == video_id(10):
            raise youtube.YouTubeError("age_restricted", "Sign in to confirm your age")
        rng = np.random.default_rng(zlib.crc32(vid.encode()))
        return AcquiredAnalysis(
            features=make_features(rng, jitter=0.4),
            meta=youtube.TrackMeta(vid, f"Title {vid}", "Artist", 200.0),
            codec="opus",
            bitrate_kbps=130.0,
            download_seconds=0.1,
            analysis_seconds=0.1,
        )

    monkeypatch.setattr(youtube, "resolve", resolve)
    monkeypatch.setattr(acquire, "fetch_and_extract", fetch)
    return calls


def drain() -> int:
    ran = 0
    while run_one("test-worker"):
        ran += 1
        assert ran < 200, "job loop did not settle"
    return ran


def test_full_pipeline(make_client, fake_youtube: dict[str, int]) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    sid = c.post(
        "/api/music/submissions",
        json={
            "urls": [
                f"https://www.youtube.com/playlist?list={PLAYLIST_ID}",
                "https://youtu.be/single00000",
            ],
        },
    ).json()["id"]
    drain()

    body = c.get(f"/api/music/submissions/{sid}").json()
    assert body["status"] == "completed"
    assert body["counts"] == {
        "total": 15,
        "queued": 0,
        "analyzing": 0,
        "done": 11,
        "failed": 2,
        "skipped": 2,
    }
    assert body["reasons"] == {"private": 1, "altered_version": 1, "silent": 1, "age_restricted": 1}
    assert [s["state"] for s in body["stages"]] == ["done"] * 4
    assert body["sources"][0]["title"] == "Test playlist"
    assert body["live_spectrum"]["track_count"] == 11
    done = [t for t in body["tracks"] if t["status"] == "done"]
    assert all(t["point"] is not None for t in done)
    assert len(body["spectrum_freqs_hz"]) == len(done[0]["spectrum"])
    assert all(t["spectrum"] is None for t in body["tracks"] if t["status"] != "done")

    profile = c.get("/api/music/profile").json()
    assert profile["id"] == body["music_profile_id"]
    assert profile["data"]["counts"]["analysed"] == 11
    assert set(profile["tracks"]) == {p["track_id"] for p in profile["data"]["map"]}
    assert set(profile["track_spectra"]) == set(profile["tracks"])
    assert all(
        len(v) == len(profile["spectrum_freqs_hz"]) for v in profile["track_spectra"].values()
    )

    sound = c.get("/api/sound-profile").json()
    assert sound["music_profile_id"] == profile["id"]
    assert sound["data"]["sources"]["music"] is True
    assert sound["data"]["model_version"] == "sound-profile/3"
    assert len(sound["data"]["layers"]["music"]) == 9
    assert sound["data"]["layers"]["answers"] is None
    assert c.get("/api/me").json()["journey"]["next_step"] == "questionnaire"


def test_analyses_are_shared_and_permanent_failures_cached(make_client, fake_youtube) -> None:  # type: ignore[no-untyped-def]
    playlist = {"urls": [f"https://www.youtube.com/playlist?list={PLAYLIST_ID}"]}
    first = make_client("First")
    first.post("/api/music/submissions", json=playlist)
    drain()
    downloads = fake_youtube["downloads"]

    second = make_client("Second")
    sid = second.post("/api/music/submissions", json=playlist).json()["id"]
    drain()
    assert fake_youtube["downloads"] == downloads  # cached, incl. silent/age-restricted
    body = second.get(f"/api/music/submissions/{sid}").json()
    assert body["status"] == "completed"
    assert body["counts"]["done"] == 10
    assert body["counts"]["failed"] == 2


def test_submission_fails_cleanly_when_nothing_resolves(make_client, fake_youtube) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    sid = c.post("/api/music/submissions", json={"urls": ["https://youtu.be/missing0000"]}).json()[
        "id"
    ]
    drain()
    body = c.get(f"/api/music/submissions/{sid}").json()
    assert body["status"] == "failed"
    assert body["error_code"] == "no_sources_resolved"
    assert body["sources"][0]["error_code"] == "unavailable"
    assert body["stages"][0]["state"] == "failed"
    assert c.get("/api/me").json()["journey"]["next_step"] == "add_music"


def test_retryable_source_errors_fail_the_submission_on_last_attempt(
    make_client, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    def flaky(ref: YouTubeRef) -> youtube.ResolvedSource:
        raise youtube.YouTubeError("network", "timed out", retryable=True)

    monkeypatch.setattr(youtube, "resolve", flaky)
    monkeypatch.setattr(queue, "backoff_seconds", lambda attempt: 0.0)
    c = make_client()
    sid = c.post("/api/music/submissions", json={"urls": ["https://youtu.be/single00000"]}).json()[
        "id"
    ]
    assert drain() == 3  # two retries, then the last attempt records the failure
    body = c.get(f"/api/music/submissions/{sid}").json()
    assert body["status"] == "failed"
    assert body["error_code"] == "no_sources_resolved"
    assert body["sources"][0]["error_code"] == "network"


def test_unexpected_errors_exhaust_retries_and_run_hook(make_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def broken(ref: YouTubeRef) -> youtube.ResolvedSource:
        raise RuntimeError("boom")

    monkeypatch.setattr(youtube, "resolve", broken)
    monkeypatch.setattr(queue, "backoff_seconds", lambda attempt: 0.0)
    c = make_client()
    sid = c.post("/api/music/submissions", json={"urls": ["https://youtu.be/single00000"]}).json()[
        "id"
    ]
    assert drain() == 3
    with session_scope() as s:
        job = s.scalar(select(Job))
        assert job is not None
        assert job.status == "failed"
        assert "boom" in (job.last_error or "")
    body = c.get(f"/api/music/submissions/{sid}").json()
    assert body["status"] == "failed"  # on_exhausted hook ran
    assert body["error_code"] == "processing_failed"


def test_queue_dedupe_and_stale_recovery(db: None) -> None:
    with session_scope() as s:
        assert queue.enqueue(s, "noop", {}, dedupe_key="k")
        assert not queue.enqueue(s, "noop", {}, dedupe_key="k")
        assert queue.enqueue(s, "noop", {})  # no key, no dedupe
    with session_scope() as s:
        job = queue.claim(s, "w1")
        assert job is not None
        s.execute(
            Job.__table__.update()
            .where(Job.id == job.id)
            .values(heartbeat_at=Job.heartbeat_at - timedelta(hours=1))
        )
    with session_scope() as s:
        assert queue.requeue_stale(s, stale_after_seconds=60) == 1
        requeued = s.get(Job, job.id)
        assert requeued is not None
        assert requeued.status == "queued"


def test_unknown_job_kind_fails_permanently(db: None) -> None:
    with session_scope() as s:
        queue.enqueue(s, "does.not.exist", {"x": 1}, max_attempts=5)
    assert run_one("w") is True
    with session_scope() as s:
        job = s.scalar(select(Job))
        assert job is not None
        assert job.status == "failed"
        assert job.attempts == 1


def test_iem_import_keeps_raw_data(db: None) -> None:
    from auralis.core.errors import Conflict
    from auralis.iem.importer import import_points
    from auralis.iem.models import FrMeasurement, IemAcousticProfile
    from tests.test_fr import synthetic_curve

    points = synthetic_curve(bass_shelf_db=6)
    with session_scope() as s:
        m = import_points(s, points, brand="Test", model="Synthetic", source="unit test")
        measurement_id = m.id
    with session_scope() as s:
        stored = s.get(FrMeasurement, measurement_id)
        assert stored is not None
        assert stored.raw_points == points
        profile = s.scalar(
            select(IemAcousticProfile).where(IemAcousticProfile.measurement_id == measurement_id)
        )
        assert profile is not None
        assert profile.features["bands"][0]["key"] == "sub_bass"
    with session_scope() as s, pytest.raises(Conflict):
        import_points(s, points, brand="Test", model="Synthetic", source="unit test")
    assert uuid.UUID(str(measurement_id))
