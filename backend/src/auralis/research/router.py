"""Research endpoints: start a run, then watch it."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status

from auralis.auth.deps import CurrentUser, DbSession
from auralis.research import service
from auralis.research.schemas import RunOut

router = APIRouter(prefix="/api", tags=["research"])


@router.post("/research/runs", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def start(user: CurrentUser, db: DbSession) -> RunOut:
    """Begin community research, or hand back the run already in flight.

    Idempotent by design: a double click, a refresh or a second tab all land on
    the same run, enforced both here and by the job queue's dedupe index.
    """
    run = service.start_run(db, user)
    return service.read_run(db, user, run.id)


@router.get("/research/runs/{run_id}", response_model=RunOut)
def read(
    run_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    after_seq: int = Query(0, ge=0, description="Only return events newer than this sequence."),
) -> RunOut:
    return service.read_run(db, user, run_id, after_seq=after_seq)


@router.get("/research/latest", response_model=RunOut | None)
def latest(user: CurrentUser, db: DbSession) -> RunOut | None:
    """The most recent run, so a returning listener resumes instead of restarting."""
    return service.latest_run(db, user)
