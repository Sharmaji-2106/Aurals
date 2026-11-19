"""Where review evidence comes from.

Two kinds of evidence now live in the same two tables, and this module reads
both. Publication reviews were gathered by hand, checked, and loaded with
``auralis seed-reviews``. Reddit discussions are retrieved by a research run
(see ``auralis.research``) and written beside them with ``kind="reddit"``.

Retrieval therefore happens in a job, never in a page request, and this module
stays a reader. ``AURALIS_REVIEW_SOURCE`` decides whether scraped sources are
served at all: ``curated`` serves only the hand-gathered ones, so an
installation can hold community evidence without publishing it.

The distinction is never blurred on the way out. Each source carries its kind,
its author and its link, and the collection note describes what the gathering
actually contains rather than asserting one story about all of it.
"""

from __future__ import annotations

from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.config import get_settings
from auralis.core.errors import NotFound
from auralis.iem.models import FrMeasurement, Iem
from auralis.reviews.models import TOPICS, ReviewClaim, ReviewSource
from auralis.reviews.schemas import (
    Claim,
    Collection,
    CollectionsOut,
    CollectionSummary,
    IemRef,
    ReviewsOut,
    Source,
    TopicOut,
)

CURATED_NOTE = (
    "A curated snapshot: these reviews were gathered by hand on the date shown, their "
    "links checked, and their passages quoted verbatim. AURALS is not reading the web "
    "while you watch."
)

MIXED_NOTE = (
    "Part of this gathering was collected by hand from published reviews; the rest was "
    "retrieved from public Reddit discussions on the date shown. Every passage is quoted "
    "as its author wrote it and links back to the original. AURALS is not reading the "
    "web while you watch."
)

REDDIT_NOTE = (
    "Retrieved from public Reddit discussions on the date shown. Every passage is quoted "
    "as its author wrote it and links back to the original. Opinions here sit beside the "
    "ranking and never inside it. AURALS is not reading the web while you watch."
)


def _note_for(kinds: set[str]) -> str:
    """Describe the gathering that is actually being returned."""
    if not kinds or kinds == {"reddit"}:
        return REDDIT_NOTE if kinds else CURATED_NOTE
    return CURATED_NOTE if "reddit" not in kinds else MIXED_NOTE


class ReviewFetcher(Protocol):
    """How the API gets review evidence for one IEM."""

    name: str
    is_live: bool

    def reviews(self, db: Session, slug: str) -> ReviewsOut: ...

    def collections(self, db: Session) -> CollectionsOut: ...


class CuratedFetcher:
    name = "curated"
    is_live = False

    def reviews(self, db: Session, slug: str) -> ReviewsOut:
        iem = db.scalar(select(Iem).where(Iem.slug == slug))
        if iem is None:
            raise NotFound("We don't have that earphone in the catalogue.")
        query = select(ReviewSource).where(ReviewSource.iem_id == iem.id)
        if not get_settings().serves_reddit:
            # Community evidence is held but not published by this installation.
            query = query.where(ReviewSource.kind != "reddit")
        rows = db.scalars(
            query.order_by(ReviewSource.published_on.desc().nulls_last(), ReviewSource.publication)
        ).all()
        if not rows:
            raise NotFound("No review evidence has been gathered for that earphone yet.")

        claims_by_source: dict[str, list[ReviewClaim]] = {}
        for row_claim in db.scalars(
            select(ReviewClaim)
            .where(ReviewClaim.source_id.in_([r.id for r in rows]))
            .order_by(ReviewClaim.topic)
        ):
            claims_by_source.setdefault(str(row_claim.source_id), []).append(row_claim)

        sources = [
            Source(
                id=row.id,
                kind=row.kind,
                publication=row.publication,
                author=row.author,
                title=row.title,
                url=row.url,
                published_on=row.published_on,
                excerpt=row.excerpt,
                retrieved_at=row.retrieved_at,
                license_note=row.license_note,
                claims=[
                    Claim(
                        id=c.id,
                        topic=c.topic,
                        topic_label=TOPICS.get(c.topic, c.topic),
                        stance=c.stance,
                        quote=c.quote,
                        tagged_by=c.tagged_by,
                    )
                    for c in claims_by_source.get(str(row.id), [])
                ],
            )
            for row in rows
        ]

        # Topics are counted from the evidence, never declared in advance: a theme with
        # nothing behind it does not appear at all.
        tally: dict[str, TopicOut] = {}
        for source in sources:
            for claim in source.claims:
                topic = tally.get(claim.topic)
                if topic is None:
                    topic = TopicOut(
                        slug=claim.topic,
                        label=claim.topic_label,
                        positive=0,
                        negative=0,
                        mixed=0,
                        sources=[],
                        contested=False,
                    )
                    tally[claim.topic] = topic
                setattr(topic, claim.stance, getattr(topic, claim.stance) + 1)
                if source.id not in topic.sources:
                    topic.sources.append(source.id)
        for topic in tally.values():
            topic.contested = topic.positive > 0 and topic.negative > 0

        order = list(TOPICS)
        topics = sorted(
            tally.values(), key=lambda t: order.index(t.slug) if t.slug in order else 99
        )
        measured = db.scalar(
            select(FrMeasurement.id).where(FrMeasurement.iem_id == iem.id).limit(1)
        )
        return ReviewsOut(
            iem=IemRef(
                id=iem.id,
                brand=iem.brand,
                model=iem.model,
                slug=iem.slug,
                has_measurement=measured is not None,
            ),
            collection=Collection(
                name=rows[0].collection,
                is_live=False,
                retrieved_at=max(r.retrieved_at for r in rows),
                note=_note_for({r.kind for r in rows}),
            ),
            topics=topics,
            sources=sources,
        )

    def collections(self, db: Session) -> CollectionsOut:
        listing = (
            select(Iem.slug, Iem.brand, Iem.model, ReviewSource.id)
            .join(ReviewSource, ReviewSource.iem_id == Iem.id)
            .order_by(Iem.brand, Iem.model)
        )
        if not get_settings().serves_reddit:
            listing = listing.where(ReviewSource.kind != "reddit")
        rows = db.execute(listing).all()
        counts: dict[str, CollectionSummary] = {}
        for slug, brand, model, _ in rows:
            item = counts.get(slug)
            if item is None:
                counts[slug] = CollectionSummary(slug=slug, brand=brand, model=model, sources=1)
            else:
                item.sources += 1
        showcase = get_settings().showcase_iem_slug
        return CollectionsOut(
            showcase_slug=showcase if showcase in counts else next(iter(counts), None),
            items=list(counts.values()),
        )


def get_fetcher() -> ReviewFetcher:
    """The reader. One implementation serves both kinds of evidence.

    ``AURALIS_REVIEW_SOURCE`` no longer selects between fetchers — retrieval
    moved into a job, so there is nothing to fetch at request time. It decides
    which kinds this installation serves, applied inside the queries above.
    """
    return CuratedFetcher()
