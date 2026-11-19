"""The research pipeline below the provider: attribution, deduplication, storage.

No network. A fake provider stands in for Reddit so the parts that decide what
is kept, who said it and how it is written down can be tested on their own.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from auralis.research.insights import Labelled
from auralis.research.jobs import _attribute, _dedupe, _excerpt, _post_key
from auralis.research.provider import Discussion
from auralis.research.store import collection_name, store_product_evidence

POST_URL = "https://www.reddit.com/r/iems/comments/abc123/moondrop_aria_impressions/"
COMMENT_URL = "https://www.reddit.com/r/iems/comments/abc123/comment/xyz789/"


def discussion(
    *,
    kind: str = "post",
    url: str = POST_URL,
    body: str = "The bass is tight and the midrange is clean, even at low volume.",
    title: str | None = "Moondrop Aria impressions",
    author: str | None = "someone",
    parent: str | None = None,
    num_comments: int | None = 4,
) -> Discussion:
    return Discussion(
        external_id=url[-8:],
        kind=kind,
        url=url,
        subreddit="iems",
        author=author,
        title=title,
        body=body,
        created_at=datetime(2026, 3, 1, tzinfo=UTC),
        score=12,
        num_comments=num_comments,
        parent_post_url=parent,
    )


# ----------------------------------------------------------------- helpers ---


def test_post_key_finds_the_thread_a_comment_belongs_to() -> None:
    # A comment permalink and its post share the post id, which is how a reply
    # is matched back to the earphone its thread was found for.
    assert _post_key(COMMENT_URL) == _post_key(POST_URL) == "abc123"


def test_post_key_degrades_to_the_url_when_it_is_not_a_thread() -> None:
    assert _post_key("https://example.com/nope") == "https://example.com/nope"


def test_dedupe_keeps_one_source_per_distinct_text() -> None:
    # Reddit quotes itself constantly. Two sources carrying the same words are
    # one piece of evidence; counting both would overstate agreement.
    long_version = discussion(url=POST_URL, body="The bass is tight and clean, even at low volume.")
    echo = discussion(
        kind="comment",
        url=COMMENT_URL,
        body="The bass is tight and clean, even at low volume.",
        title=None,
    )
    kept = _dedupe([long_version, echo])
    assert len(kept) == 1


def test_dedupe_keeps_genuinely_different_opinions() -> None:
    a = discussion(url=POST_URL, body="The bass is tight and clean.")
    b = discussion(kind="comment", url=COMMENT_URL, body="The treble is harsh to me.", title=None)
    assert len(_dedupe([a, b])) == 2


def test_dedupe_never_returns_two_rows_for_one_url() -> None:
    a = discussion(url=POST_URL, body="One reading of it.")
    b = discussion(url=POST_URL, body="A different reading entirely.")
    assert len(_dedupe([a, b])) == 1


def test_excerpt_cuts_on_a_word_boundary() -> None:
    long = discussion(body="word " * 200)
    out = _excerpt(long)
    assert len(out) <= 321
    assert out.endswith("…")
    # Never mid-word: the quote has to read as the author wrote it.
    assert not out.removesuffix("…").endswith("wor")


def test_excerpt_leaves_a_short_quote_untouched() -> None:
    assert _excerpt(discussion(body="Short and clean.")) == "Short and clean."


# ------------------------------------------------------------- attribution ---


def test_a_comment_is_attributed_to_the_thread_it_was_found_under() -> None:
    found = {"moondrop-aria": [discussion()]}
    reply = discussion(
        kind="comment",
        url=COMMENT_URL,
        title=None,
        parent=POST_URL,
        body=(
            "Agreed on the bass. For me the treble is a little hot on busy tracks, "
            "and I end up reaching for the volume knob after an hour or so."
        ),
    )
    out = _attribute(
        found,
        [reply],
        catalogue=[],
        targets=[{"slug": "moondrop-aria", "brand": "Moondrop", "model": "Aria"}],
    )
    assert reply in out["moondrop-aria"]


def test_a_comment_with_no_findable_thread_is_dropped() -> None:
    orphan = discussion(
        kind="comment",
        url="https://www.reddit.com/r/iems/comments/other99/comment/zzz/",
        title=None,
        parent="https://www.reddit.com/r/iems/comments/other99/x/",
        body="Some opinion about something we never searched for, at length.",
    )
    out = _attribute(
        {"moondrop-aria": [discussion()]},
        [orphan],
        catalogue=[],
        targets=[{"slug": "moondrop-aria", "brand": "Moondrop", "model": "Aria"}],
    )
    assert orphan not in out.get("moondrop-aria", [])


def test_attribution_never_invents_a_product_key() -> None:
    out = _attribute({}, [], catalogue=[], targets=[])
    assert out == {}


# ----------------------------------------------------------------- storage ---


@pytest.fixture
def aria(db: None) -> uuid.UUID:
    from auralis.db import session_scope
    from auralis.iem.models import Iem

    with session_scope() as s:
        iem = Iem(brand="Moondrop", model="Aria", slug="moondrop-aria")
        s.add(iem)
        s.flush()
        return iem.id


def test_sources_are_stored_with_their_attribution(aria: uuid.UUID) -> None:
    from auralis.db import session_scope
    from auralis.reviews.models import ReviewSource

    run_id = uuid.uuid4()
    sources, claims = store_product_evidence(
        slug="moondrop-aria",
        run_id=run_id,
        discussions=[discussion()],
        labelled=[],
        license_note="Quoted with attribution.",
        max_excerpt=320,
    )
    assert (sources, claims) == (1, 0)

    with session_scope() as s:
        row = s.scalar(select(ReviewSource).where(ReviewSource.iem_id == aria))
        assert row is not None
        assert row.kind == "reddit"
        # The subreddit is what a reader needs to judge the source.
        assert row.publication == "r/iems"
        assert row.author == "u/someone"
        assert row.url == POST_URL
        assert row.published_on is not None
        assert row.collection == collection_name(run_id)
        assert row.license_note == "Quoted with attribution."


def test_a_source_with_no_usable_claim_is_still_kept(aria: uuid.UUID) -> None:
    # "We found this discussion but could not group it" is true and useful.
    sources, claims = store_product_evidence(
        slug="moondrop-aria",
        run_id=uuid.uuid4(),
        discussions=[discussion()],
        labelled=[],
        license_note="n",
        max_excerpt=320,
    )
    assert sources == 1
    assert claims == 0


def test_claims_attach_to_the_discussion_they_came_from(aria: uuid.UUID) -> None:
    from auralis.db import session_scope
    from auralis.reviews.models import ReviewClaim, ReviewSource

    first = discussion(url=POST_URL, body="Bass is tight.")
    second = discussion(url=COMMENT_URL, body="Treble is harsh.", title=None)
    sources, claims = store_product_evidence(
        slug="moondrop-aria",
        run_id=uuid.uuid4(),
        discussions=[first, second],
        # Index 1 is the second discussion; the claim must land on that source.
        labelled=[
            Labelled(
                source_index=1,
                quote="Treble is harsh.",
                topic="treble",
                stance="negative",
                tagged_by="llm/test-model",
            )
        ],
        license_note="n",
        max_excerpt=320,
    )
    assert (sources, claims) == (2, 1)

    with session_scope() as s:
        owner = s.scalar(select(ReviewSource).where(ReviewSource.url == COMMENT_URL))
        claim = s.scalar(select(ReviewClaim))
        assert owner is not None
        assert claim is not None
        assert claim.source_id == owner.id
        # Provenance is visible in the same column the editorial tags use.
        assert claim.tagged_by == "llm/test-model"


def test_rerunning_replaces_a_sources_claims_rather_than_duplicating(aria: uuid.UUID) -> None:
    from auralis.db import session_scope
    from auralis.reviews.models import ReviewClaim, ReviewSource

    def run_once(topic: str) -> None:
        store_product_evidence(
            slug="moondrop-aria",
            run_id=uuid.uuid4(),
            discussions=[discussion()],
            labelled=[
                Labelled(
                    source_index=0,
                    quote="Bass is tight.",
                    topic=topic,
                    stance="positive",
                    tagged_by="llm/test-model",
                )
            ],
            license_note="n",
            max_excerpt=320,
        )

    run_once("bass")
    run_once("detail")

    with session_scope() as s:
        # One source, because (iem_id, url) is unique; one claim, because the
        # retrieval is the record rather than an append-only log.
        assert len(s.scalars(select(ReviewSource)).all()) == 1
        rows = s.scalars(select(ReviewClaim)).all()
        assert len(rows) == 1
        assert rows[0].topic == "detail"


def test_storing_for_an_unknown_earphone_does_nothing(db: None) -> None:
    assert store_product_evidence(
        slug="not-in-the-catalogue",
        run_id=uuid.uuid4(),
        discussions=[discussion()],
        labelled=[],
        license_note="n",
        max_excerpt=320,
    ) == (0, 0)


# -------------------------------------------------------------------- api ---


def test_a_run_is_created_once_and_reused(make_client) -> None:  # type: ignore[no-untyped-def]
    client = make_client("Researcher")
    questions = client.get("/api/questionnaire").json()
    answers = {}
    for q in questions["questions"]:
        opts = q.get("options") or []
        if opts:
            answers[q["id"]] = opts[len(opts) // 2]["value"]
    assert (
        client.post(
            "/api/questionnaire/responses",
            json={"version": questions["version"], "answers": answers},
        ).status_code
        == 201
    )

    first = client.post("/api/research/runs")
    assert first.status_code == 202
    run_id = first.json()["id"]

    # A second request must land on the same run: a refresh or a second tab is
    # not a reason to research twice.
    again = client.post("/api/research/runs")
    assert again.status_code == 202
    assert again.json()["id"] == run_id

    latest = client.get("/api/research/latest")
    assert latest.status_code == 200
    assert latest.json()["id"] == run_id

    read = client.get(f"/api/research/runs/{run_id}")
    assert read.status_code == 200
    body = read.json()
    assert body["status"] in {"queued", "running", "partial", "failed", "succeeded"}
    # Ranking is the job's work, so it is empty until the worker has run.
    assert isinstance(body["ranking"], list)
    assert isinstance(body["events"], list)


def test_one_listener_cannot_read_anothers_run(make_client) -> None:  # type: ignore[no-untyped-def]
    owner = make_client("Owner")
    questions = owner.get("/api/questionnaire").json()
    answers = {
        q["id"]: (q.get("options") or [{"value": "3"}])[0]["value"] for q in questions["questions"]
    }
    owner.post(
        "/api/questionnaire/responses",
        json={"version": questions["version"], "answers": answers},
    )
    run_id = owner.post("/api/research/runs").json()["id"]

    stranger = make_client("Stranger")
    assert stranger.get(f"/api/research/runs/{run_id}").status_code == 404
    assert stranger.get("/api/research/latest").json() is None


def test_research_requires_a_sound_profile(make_client) -> None:  # type: ignore[no-untyped-def]
    client = make_client("No Profile")
    response = client.post("/api/research/runs")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "no_sound_profile"
