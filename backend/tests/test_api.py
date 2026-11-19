"""HTTP-level behaviour: sessions, validation, authorisation boundaries."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.db

PLAYLIST = "https://www.youtube.com/playlist?list=PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm"


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_session_lifecycle(client: TestClient) -> None:
    assert client.get("/api/me").status_code == 401
    created = client.post("/api/session", json={"display_name": "  Ada  "})
    assert created.status_code == 201
    cookie = created.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    me = client.get("/api/me").json()
    assert me["profile"]["display_name"] == "Ada"
    assert me["journey"]["next_step"] == "add_music"


def test_state_changes_require_client_header(db: None) -> None:
    from auralis.main import create_app

    with TestClient(create_app()) as bare:
        response = bare.post("/api/session", json={"display_name": "x"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf"


def test_forged_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("auralis_session", "not-a-real-token")
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "body",
    [{"display_name": ""}, {"display_name": "x" * 61}, {"display_name": "ok", "admin": True}],
)
def test_session_validation(client: TestClient, body: dict[str, object]) -> None:
    response = client.post("/api/session", json=body)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_profile_update(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    ok = c.patch(
        "/api/me/profile",
        json={
            "currency": "eur",
            "budget_min": 50,
            "budget_max": 120,
            "experience": "enthusiast",
            "current_gear": ["KZ ZSN"],
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["currency"] == "EUR"
    assert body["budget_max"] == 120.0
    bad = c.patch("/api/me/profile", json={"budget_min": 200, "budget_max": 100})
    assert bad.status_code == 422
    assert c.patch("/api/me/profile", json={"experience": "god"}).status_code == 422


def test_submission_url_problems_are_reported_per_url(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    response = c.post(
        "/api/music/submissions",
        json={
            "urls": [PLAYLIST, "https://vimeo.com/1", "https://youtube.com/watch?v=bad"],
        },
    )
    assert response.status_code == 422
    problems = response.json()["error"]["problems"]
    assert [(p["index"], p["code"]) for p in problems] == [
        (1, "unsupported_host"),
        (2, "invalid_id"),
    ]


def test_submission_is_queued_and_owned(make_client) -> None:  # type: ignore[no-untyped-def]
    alice, bob = make_client("Alice"), make_client("Bob")
    created = alice.post("/api/music/submissions", json={"urls": [PLAYLIST, PLAYLIST]})
    assert created.status_code == 202
    body = created.json()
    assert body["status"] == "queued"
    assert len(body["sources"]) == 1  # duplicates collapsed
    sid = body["id"]

    assert alice.get(f"/api/music/submissions/{sid}").status_code == 200
    # Another user can't see it, and can't tell it exists.
    assert bob.get(f"/api/music/submissions/{sid}").status_code == 404
    assert bob.get("/api/music/submissions").json() == []
    assert alice.get("/api/me").json()["journey"]["next_step"] == "questionnaire"


def test_active_submission_limit(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    for i in range(2):
        assert (
            c.post(
                "/api/music/submissions", json={"urls": [f"https://youtu.be/aaaaaaaaaa{i}"]}
            ).status_code
            == 202
        )
    third = c.post("/api/music/submissions", json={"urls": ["https://youtu.be/bbbbbbbbbbb"]})
    assert third.status_code == 429


def test_questionnaire_flow(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    assert c.get("/api/questionnaire/responses/latest").json() == {"response": None}
    questionnaire = c.get("/api/questionnaire").json()
    answers = {q["id"]: q["options"][0]["value"] for q in questionnaire["questions"]}
    stale = c.post("/api/questionnaire/responses", json={"version": "old", "answers": answers})
    assert stale.json()["error"]["code"] == "stale_questionnaire"
    response = c.post(
        "/api/questionnaire/responses",
        json={"version": questionnaire["version"], "answers": answers},
    )
    assert response.status_code == 201
    profile = response.json()["data"]
    assert profile["sources"]["questionnaire"] is True
    assert profile["sources"]["music"] is False
    assert c.get("/api/sound-profile").json()["id"] == response.json()["id"]
    latest = c.get("/api/questionnaire/responses/latest").json()["response"]
    assert latest["answers"] == answers
    assert c.get("/api/music/profile").status_code == 404


def test_outdated_profile_is_rebuilt_not_rewritten(make_client) -> None:  # type: ignore[no-untyped-def]
    from sqlalchemy import func, select, update

    from auralis.db import session_scope
    from auralis.sound_profile.models import SoundProfile

    c = make_client()
    version = c.get("/api/questionnaire").json()["version"]
    first = c.post(
        "/api/questionnaire/responses", json={"version": version, "answers": {"bass_amount": "4"}}
    ).json()
    with session_scope() as s:
        s.execute(update(SoundProfile).values(model_version="sound-profile/1"))
    upgraded = c.get("/api/sound-profile").json()
    assert upgraded["id"] != first["id"]
    assert upgraded["data"]["model_version"] == "sound-profile/3"
    assert c.get("/api/sound-profile").json()["id"] == upgraded["id"]
    with session_scope() as s:
        assert s.scalar(select(func.count()).select_from(SoundProfile)) == 2


def test_delete_account_removes_personal_data(make_client) -> None:  # type: ignore[no-untyped-def]
    from sqlalchemy import func, select

    from auralis.db import session_scope
    from auralis.music.models import MusicSubmission
    from auralis.profiles.models import Profile

    c = make_client()
    c.post("/api/music/submissions", json={"urls": [PLAYLIST]})
    response = c.delete("/api/me")
    assert response.status_code == 204
    assert "auralis_session" in response.headers.get("set-cookie", "")
    assert c.get("/api/me").status_code == 401
    with session_scope() as s:
        assert s.scalar(select(func.count()).select_from(Profile)) == 0
        assert s.scalar(select(func.count()).select_from(MusicSubmission)) == 0


def test_link_preview(make_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from auralis.music import preview

    calls = []

    def fake_fetch(ref):  # type: ignore[no-untyped-def]
        calls.append(ref)
        return preview.LinkPreview("A title", "An artist", "5NV6Rdv1a3I", True)

    monkeypatch.setattr(preview, "_fetch_youtube", fake_fetch)
    preview._cache.clear()
    c = make_client()
    url = "https://www.youtube.com/playlist?list=PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm"
    body = c.get("/api/music/link-preview", params={"url": url}).json()
    assert body == {
        "kind": "playlist",
        "id": "PLT3ccL9Gu5yorlbETXH5gJGVGpcAGjmPm",
        "title": "A title",
        "author": "An artist",
        "thumbnail_video_id": "5NV6Rdv1a3I",
        "thumbnail_url": None,
        "available": True,
    }
    c.get("/api/music/link-preview", params={"url": url})
    assert len(calls) == 1  # cached
    bad = c.get("/api/music/link-preview", params={"url": "https://vimeo.com/1"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "unsupported_host"


def test_sound_profile_preview_does_not_store(make_client) -> None:  # type: ignore[no-untyped-def]
    c = make_client()
    body = c.post("/api/sound-profile/preview", json={"answers": {"bass_amount": "5"}}).json()
    base = {d["key"]: d for d in body["baseline"]["dimensions"]}
    draft = {d["key"]: d for d in body["preview"]["dimensions"]}
    assert base["sub_bass"]["value"] == 0.5
    assert draft["sub_bass"]["value"] > 0.7
    assert c.get("/api/sound-profile").status_code == 404
    invalid = c.post("/api/sound-profile/preview", json={"answers": {"bass_amount": "9"}})
    assert invalid.json()["error"]["code"] == "invalid_answers"


def _synthetic_curve(bass: float) -> list[list[float]]:
    """Made-up response: flat plus a bass shelf. Test data only, never a real IEM."""
    freqs = np.geomspace(20, 20_000, 400)
    return [[float(f), float(90 + bass / (1 + (f / 150) ** 2))] for f in freqs]


def test_recommendations_explain_themselves(make_client) -> None:  # type: ignore[no-untyped-def]
    from auralis.db import session_scope
    from auralis.iem.importer import checksum, import_points
    from auralis.iem.models import FrTarget

    c = make_client()
    version = c.get("/api/questionnaire").json()["version"]
    c.post(
        "/api/questionnaire/responses", json={"version": version, "answers": {"bass_amount": "5"}}
    )
    empty = c.get("/api/recommendations").json()
    assert empty["items"] == []
    assert any("import-autoeq" in note for note in empty["notes"])

    target = _synthetic_curve(0)
    with session_scope() as s:
        s.add(
            FrTarget(
                name="harman-ie-2019",
                label="Synthetic stand-in",
                rig_family="iec60318-4",
                citation="test",
                source="test",
                raw_points=target,
                checksum=checksum(target),
            )
        )
    with session_scope() as s:
        for model, bass in (("Flat", 0.0), ("Bassy", 6.0)):
            import_points(
                s,
                _synthetic_curve(bass),
                brand="Synthetic",
                model=model,
                source="synthetic test data",
                rig_family="iec60318-4",
            )
    body = c.get("/api/recommendations", params={"limit": 5}).json()
    assert body["recommender"] == "harman-personal/1+standing/1"
    assert body["dataset"]["measurements"] == 2
    top = body["items"][0]
    assert top["model"] == "Bassy"
    assert top["measurement"]["source"] == "synthetic test data"
    assert any(r["kind"] == "match" for r in top["reasons"])
    assert {g["region"] for g in top["regions"]} >= {"bass", "vocals", "treble"}
    assert c.get("/api/recommendations", params={"limit": 99}).status_code == 422


def test_catalog_refuses_unsourced_facts(db, tmp_path) -> None:  # type: ignore[no-untyped-def]
    from auralis.db import session_scope
    from auralis.iem.catalog import import_catalog, parse_drivers
    from auralis.iem.importer import import_points
    from auralis.recommend.service import load_candidates

    assert parse_drivers("1DD+4BA") == {"dynamic": 1, "balanced_armature": 4}
    with session_scope() as s:
        import_points(
            s,
            _synthetic_curve(0),
            brand="Synthetic",
            model="One",
            source="synthetic test data",
            rig_family="iec60318-4",
        )
    header = (
        "brand,model,price,currency,price_source,price_source_url,price_observed_on,"
        "driver_config,release_year,availability,specs_source_url,specs_retrieved_on\n"
    )
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text(
        header + "Synthetic,One,49.99,USD,Example shop,https://example.com/one,2026-09-18,"
        "1DD,2024,available,https://example.com/specs,2026-09-18\n"
        + "Synthetic,One,19.99,USD,,,,,,,,\n"
        + "Nobody,Nothing,10,USD,Shop,,2026-09-18,,,,,\n",
        encoding="utf-8",
    )
    with session_scope() as s:
        report = import_catalog(s, csv_path)
    assert report.prices == 1
    assert report.updated == 1
    assert len(report.errors) == 2
    with session_scope() as s:
        (one,) = load_candidates(s, "iec60318-4")
    assert one.price is not None
    assert str(one.price.amount) == "49.99"
    assert one.driver_config == {"dynamic": 1}


def test_link_preview_reads_spotify_playlists(make_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """A Spotify link gets its own preview path, with the platform's own artwork."""
    from auralis.music import preview

    def fake_fetch(ref):  # type: ignore[no-untyped-def]
        return preview.LinkPreview(
            "Today's Top Hits", None, None, True, "https://i.scdn.co/image/abc123"
        )

    monkeypatch.setattr(preview, "_fetch_spotify", fake_fetch)
    preview._cache.clear()
    c = make_client()
    body = c.get(
        "/api/music/link-preview",
        params={"url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"},
    ).json()
    assert body == {
        "kind": "spotify_playlist",
        "id": "37i9dQZF1DXcBWIGoYBM5M",
        "title": "Today's Top Hits",
        "author": None,
        "thumbnail_video_id": None,
        "thumbnail_url": "https://i.scdn.co/image/abc123",
        "available": True,
    }
    bad = c.get(
        "/api/music/link-preview",
        params={"url": "https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M"},
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "unsupported_path"
