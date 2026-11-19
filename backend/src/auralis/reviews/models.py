"""Subjective review evidence, kept in its own tables.

``iem/models.py`` sets the rule this module follows: subjective impressions never mix
with measurements. A measurement is a number from a rig with a traceable origin; a
review is one person's opinion, and the two answer different questions.

Three further rules hold here:

* Every row carries where it came from — publication, author, date, URL, and when it
  was retrieved. Nothing is stored that cannot be opened and checked.
* A claim is a passage quoted verbatim from a source. The topic and stance attached to
  it are an editorial judgement made by Auralis about that passage, recorded as such in
  ``tagged_by`` so the two are never confused.
* ``collection`` separates one gathering of evidence from another, so a curated
  snapshot can never be mistaken for a live retrieval.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, UUIDPk

# The themes a passage can be about. Candidates, not conclusions: a topic only appears
# on screen when a real source actually says something about it.
TOPICS: dict[str, str] = {
    "bass": "Bass",
    "vocals": "Midrange and vocals",
    "treble": "Treble",
    "detail": "Detail and resolution",
    "soundstage": "Soundstage and imaging",
    "fit": "Comfort and fit",
    "isolation": "Isolation",
    "build": "Build and accessories",
}


class ReviewSource(UUIDPk, Base):
    """One published review or discussion, as it was found."""

    __tablename__ = "iem_review_sources"
    __table_args__ = (UniqueConstraint("iem_id", "url"),)

    iem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iems.id", ondelete="CASCADE"), index=True)
    # Which gathering this belongs to, e.g. "curated/moondrop-aria/1".
    collection: Mapped[str] = mapped_column(String(80), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # publication | forum | reddit | video
    publication: Mapped[str] = mapped_column(String(120))
    author: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)
    published_on: Mapped[date | None] = mapped_column(Date)
    # A representative passage, for the card before it is opened.
    excerpt: Mapped[str | None] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    license_note: Mapped[str | None] = mapped_column(Text)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReviewClaim(UUIDPk, Base):
    """A passage quoted from a source, with the topic Auralis read it as being about."""

    __tablename__ = "iem_review_claims"

    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("iem_review_sources.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[str] = mapped_column(String(32), index=True)
    stance: Mapped[str] = mapped_column(String(16))  # positive | negative | mixed
    quote: Mapped[str] = mapped_column(Text)
    # Who decided this quote is about this topic. Never the reviewer.
    tagged_by: Mapped[str] = mapped_column(String(40), default="auralis-editorial")
    tagged_on: Mapped[date | None] = mapped_column(Date)
