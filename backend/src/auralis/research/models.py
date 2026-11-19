"""Community research runs, and the progress they emit while running.

Two tables, with different jobs.

``ResearchRun`` is the unit of work and the thing the interface asks about: has
research been done for this listener, is it running, did it fail, and what did
it find. It also keeps a snapshot of the ranking it researched, because the
ranking is computed on demand and would otherwise not survive a page refresh —
the snapshot is a copy of the engine's output, never a second opinion about it.

``ResearchEvent`` is an append-only log of what happened, in order. It exists
because the discovery sequence has to be driven by real progress rather than a
timer, and the project has no event transport: no websockets, no server-sent
events. Writing each step as a row and letting the client poll is the same
approach the music pipeline already takes, and it has the useful property that
a refresh mid-run replays honestly instead of starting over.

The evidence itself does not live here. Reddit sources and their claims go into
``iem_review_sources`` / ``iem_review_claims`` with ``kind="reddit"``, beside
the hand-gathered publication reviews, so one reader and one API serve both.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk

#: The stages a run moves through, in the order they are emitted. Kept here
#: rather than in the frontend so the vocabulary has one owner.
STAGES: tuple[str, ...] = (
    "profile_ready",
    "catalogue_loaded",
    "candidates_scored",
    "ranking_ready",
    "winner_selected",
    "research_started",
    "product_started",
    "query_issued",
    "posts_found",
    "comments_read",
    "product_done",
    "insights_ready",
    "complete",
    "failed",
)

#: Terminal states. ``partial`` means the ranking is sound and some community
#: research succeeded, but not all of it — the common real outcome, and not a
#: failure to hide.
TERMINAL: frozenset[str] = frozenset({"succeeded", "partial", "failed"})


class ResearchRun(UUIDPk, Timestamped, Base):
    """One attempt to gather community evidence for a listener's ranking."""

    __tablename__ = "research_runs"
    __table_args__ = (
        Index("ix_research_runs_user_created", "user_id", "created_at"),
        # Finding a user's live run without scanning: the job dedupe key covers
        # enqueueing, this covers answering "is one already going?".
        Index("ix_research_runs_status", "status"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    sound_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sound_profiles.id", ondelete="CASCADE")
    )
    # queued -> running -> succeeded | partial | failed
    status: Mapped[str] = mapped_column(String(16), default="queued")
    #: Which provider fetched the evidence. Stored per run so a result can
    #: always be traced to what retrieved it, including after a provider swap.
    provider: Mapped[str] = mapped_column(String(40))

    #: The engine's ranked output at the moment research began:
    #: ``[{slug, rank, brand, model, mean, low, high}, ...]``. A snapshot for
    #: continuity across a refresh, not a cached ranking — ``/api/recommendations``
    #: remains the only implementation.
    ranking: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    products_requested: Mapped[int] = mapped_column(Integer, default=0)
    products_with_evidence: Mapped[int] = mapped_column(Integer, default=0)
    sources_kept: Mapped[int] = mapped_column(Integer, default=0)
    claims_made: Mapped[int] = mapped_column(Integer, default=0)

    error_code: Mapped[str | None] = mapped_column(String(40))
    error_message: Mapped[str | None] = mapped_column(Text)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL


class ResearchEvent(UUIDPk, Timestamped, Base):
    """One thing that happened during a run, with the numbers it produced.

    ``seq`` is assigned by the writer and is unique per run, so a client can
    ask for everything after the last sequence it saw and never miss or
    duplicate a step. ``payload`` carries only values the backend actually
    computed; a stage with nothing real to report carries an empty payload
    rather than a plausible-looking one.
    """

    __tablename__ = "research_events"
    __table_args__ = (
        UniqueConstraint("run_id", "seq", name="uq_research_events_run_seq"),
        Index("ix_research_events_run_seq", "run_id", "seq"),
    )

    run_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("research_runs.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    stage: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
