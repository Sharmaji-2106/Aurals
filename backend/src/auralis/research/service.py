"""Starting and reading community research runs."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.auth.models import User
from auralis.config import get_settings
from auralis.core.errors import NotFound
from auralis.research.jobs import enqueue_research
from auralis.research.models import ResearchEvent, ResearchRun
from auralis.research.schemas import Event, RankedItem, RunOut
from auralis.sound_profile.service import latest_sound_profile


def start_run(db: Session, user: User) -> ResearchRun:
    """Begin research for this listener, or return the run already going.

    Deliberately cheap. Ranking the catalogue is a few hundred milliseconds of
    numpy, and doing it here would mean every visit to the results page ranked
    twice — once for the page and once for this snapshot — against a single API
    process. The job does it instead, in a worker, and emits the analytical
    stages as it goes. That is also more honest: those events then describe
    work the run actually performed rather than work the request performed on
    its behalf.
    """
    profile = latest_sound_profile(db, user)

    live = db.scalar(
        select(ResearchRun)
        .where(
            ResearchRun.user_id == user.id,
            ResearchRun.sound_profile_id == profile.id,
            ResearchRun.status.in_(("queued", "running")),
        )
        .order_by(ResearchRun.created_at.desc())
        .limit(1)
    )
    if live is not None:
        return live

    settings = get_settings()
    run = ResearchRun(
        user_id=user.id,
        sound_profile_id=profile.id,
        status="queued",
        provider=settings.reddit_provider,
        ranking=[],
    )
    db.add(run)
    db.flush()
    enqueue_research(db, run.id, profile.id)
    db.commit()
    return run


def read_run(db: Session, user: User, run_id: uuid.UUID, *, after_seq: int = 0) -> RunOut:
    run = db.scalar(
        select(ResearchRun).where(ResearchRun.id == run_id, ResearchRun.user_id == user.id)
    )
    if run is None:
        raise NotFound("We couldn't find that research run.")
    return _out(db, run, after_seq=after_seq)


def latest_run(db: Session, user: User) -> RunOut | None:
    """The listener's most recent run, for picking the sequence back up."""
    run = db.scalar(
        select(ResearchRun)
        .where(ResearchRun.user_id == user.id)
        .order_by(ResearchRun.created_at.desc())
        .limit(1)
    )
    return None if run is None else _out(db, run, after_seq=0)


def _out(db: Session, run: ResearchRun, *, after_seq: int) -> RunOut:
    rows = db.scalars(
        select(ResearchEvent)
        .where(ResearchEvent.run_id == run.id, ResearchEvent.seq > after_seq)
        .order_by(ResearchEvent.seq)
    ).all()
    return RunOut(
        id=run.id,
        status=run.status,
        provider=run.provider,
        finished=run.is_terminal,
        ranking=[RankedItem(**item) for item in run.ranking],
        products_requested=run.products_requested,
        products_with_evidence=run.products_with_evidence,
        sources_kept=run.sources_kept,
        claims_made=run.claims_made,
        error_code=run.error_code,
        error_message=run.error_message,
        created_at=run.created_at,
        finished_at=run.finished_at,
        events=[Event(seq=r.seq, stage=r.stage, payload=r.payload, at=r.created_at) for r in rows],
    )
