"""Writing retrieved discussions into the evidence tables.

Reddit sources go into ``iem_review_sources`` and ``iem_review_claims``
alongside the hand-gathered publication reviews, with ``kind="reddit"``. That
is not a shortcut — it is the point. One reader, one API and one page serve
both kinds of evidence, the existing unique constraint on ``(iem_id, url)``
makes re-running a search idempotent, and the ``tagged_by`` column already
records who made each judgement, so a person's reading and a model's are
distinguishable without inventing a parallel schema.

What is stored is the author's words. The excerpt is trimmed to length on a
word boundary and otherwise untouched, the permalink always points back to the
original, and a source with no usable claim is still kept — "we found this
discussion but could not group it" is a true and useful thing to show.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select

from auralis.db import session_scope
from auralis.iem.models import Iem
from auralis.research.insights import Labelled
from auralis.research.provider import Discussion
from auralis.reviews.models import ReviewClaim, ReviewSource


def collection_name(run_id: uuid.UUID) -> str:
    """The gathering label. Mirrors the curated files' "curated/<slug>/1" shape."""
    return f"reddit/{run_id.hex[:12]}"


def store_product_evidence(
    *,
    slug: str,
    run_id: uuid.UUID,
    discussions: list[Discussion],
    labelled: list[Labelled],
    license_note: str,
    max_excerpt: int,
) -> tuple[int, int]:
    """Persist one product's discussions and their claims.

    Returns ``(sources, claims)``. ``labelled`` entries reference discussions
    by index, so a quote can never be attached to a source it did not come
    from.
    """
    if not discussions:
        return (0, 0)

    claims_by_index: dict[int, list[Labelled]] = {}
    for item in labelled:
        claims_by_index.setdefault(item.source_index, []).append(item)

    now = datetime.now(UTC)
    collection = collection_name(run_id)
    sources = claims = 0

    with session_scope() as s:
        iem = s.scalar(select(Iem).where(Iem.slug == slug))
        if iem is None:
            return (0, 0)

        for index, discussion in enumerate(discussions):
            row = s.scalar(
                select(ReviewSource).where(
                    ReviewSource.iem_id == iem.id, ReviewSource.url == discussion.url
                )
            )
            if row is None:
                row = ReviewSource(iem_id=iem.id, url=discussion.url)
                s.add(row)

            row.collection = collection
            row.kind = "reddit"
            # "Publication" is the subreddit for a Reddit source: it is what a
            # reader needs to judge where the opinion came from.
            row.publication = f"r/{discussion.subreddit}" if discussion.subreddit else "Reddit"
            row.author = f"u/{discussion.author}" if discussion.author else None
            row.title = _title(discussion)
            row.published_on = discussion.created_at.date() if discussion.created_at else None
            row.excerpt = _excerpt(discussion.body, max_excerpt)
            row.retrieved_at = now
            row.license_note = license_note
            s.flush()

            # The retrieval is the record: re-running replaces this source's
            # claims rather than accumulating duplicates of them.
            s.execute(delete(ReviewClaim).where(ReviewClaim.source_id == row.id))
            for claim in claims_by_index.get(index, []):
                s.add(
                    ReviewClaim(
                        source_id=row.id,
                        topic=claim.topic,
                        stance=claim.stance,
                        quote=_excerpt(claim.quote, max_excerpt),
                        tagged_by=claim.tagged_by,
                        tagged_on=now.date(),
                    )
                )
                claims += 1
            sources += 1

    return (sources, claims)


def _title(discussion: Discussion) -> str:
    if discussion.title:
        return discussion.title[:300]
    if discussion.parent_post_title:
        return f"Comment on: {discussion.parent_post_title}"[:300]
    return "Comment in a Reddit discussion"


def _excerpt(text: str, limit: int) -> str:
    clean = " ".join(text.split())
    if len(clean) <= limit:
        return clean
    return f"{clean[:limit].rsplit(' ', 1)[0]}…"
