"""Queue primitives: enqueue, claim, finish, retry, heartbeat and stale-job recovery."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from auralis.core.time import utcnow
from auralis.jobs.models import Job

LIVE_DEDUPE_WHERE = text("status IN ('queued', 'running') AND dedupe_key IS NOT NULL")


@dataclass(frozen=True, slots=True)
class ClaimedJob:
    id: uuid.UUID
    kind: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int

    @property
    def is_last_attempt(self) -> bool:
        return self.attempts >= self.max_attempts


def enqueue(
    session: Session,
    kind: str,
    payload: dict[str, Any],
    *,
    dedupe_key: str | None = None,
    priority: int = 100,
    max_attempts: int = 3,
    delay_seconds: float = 0,
) -> bool:
    """Add a job in the caller's transaction. Returns False if a live duplicate exists."""
    stmt = insert(Job).values(
        id=uuid.uuid4(),
        kind=kind,
        payload=payload,
        status="queued",
        priority=priority,
        attempts=0,
        max_attempts=max_attempts,
        dedupe_key=dedupe_key,
        run_after=utcnow() + timedelta(seconds=delay_seconds),
    )
    if dedupe_key is not None:
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["dedupe_key"], index_where=LIVE_DEDUPE_WHERE
        )
    # rowcount is unreliable for ON CONFLICT DO NOTHING; RETURNING tells us for sure.
    return session.execute(stmt.returning(Job.id)).scalar_one_or_none() is not None


def claim(session: Session, worker_id: str) -> ClaimedJob | None:
    ready = (
        select(Job.id)
        .where(Job.status == "queued", Job.run_after <= func.now())
        .order_by(Job.priority, Job.run_after)
        .limit(1)
        .with_for_update(skip_locked=True)
        .scalar_subquery()
    )
    row = session.execute(
        update(Job)
        .where(Job.id == ready)
        .values(
            status="running",
            attempts=Job.attempts + 1,
            locked_by=worker_id,
            heartbeat_at=func.now(),
        )
        .returning(Job.id, Job.kind, Job.payload, Job.attempts, Job.max_attempts)
    ).one_or_none()
    session.commit()
    if row is None:
        return None
    return ClaimedJob(
        id=row.id,
        kind=row.kind,
        payload=row.payload,
        attempts=row.attempts,
        max_attempts=row.max_attempts,
    )


def mark_succeeded(session: Session, job_id: uuid.UUID) -> None:
    session.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(status="succeeded", finished_at=func.now(), locked_by=None, last_error=None)
    )
    session.commit()


def mark_failed(session: Session, job: ClaimedJob, error: str, *, retry_in: float | None) -> None:
    """Retry after ``retry_in`` seconds, or fail permanently when it is None."""
    values: dict[str, Any] = {"locked_by": None, "last_error": error[:4000]}
    if retry_in is None:
        values |= {"status": "failed", "finished_at": func.now()}
    else:
        values |= {"status": "queued", "run_after": utcnow() + timedelta(seconds=retry_in)}
    session.execute(update(Job).where(Job.id == job.id).values(**values))
    session.commit()


def heartbeat(session: Session, job_id: uuid.UUID, worker_id: str) -> None:
    session.execute(
        update(Job)
        .where(Job.id == job_id, Job.locked_by == worker_id, Job.status == "running")
        .values(heartbeat_at=func.now())
    )
    session.commit()


def requeue_stale(session: Session, stale_after_seconds: int) -> int:
    """Recover jobs whose worker died mid-run. Exhausted jobs are failed instead."""
    cutoff = utcnow() - timedelta(seconds=stale_after_seconds)
    stale = Job.status == "running", Job.heartbeat_at < cutoff
    failed = session.execute(
        update(Job)
        .where(*stale, Job.attempts >= Job.max_attempts)
        .values(
            status="failed",
            finished_at=func.now(),
            locked_by=None,
            last_error="worker stopped responding",
        )
    ).rowcount  # type: ignore[attr-defined]
    requeued = session.execute(
        update(Job).where(*stale).values(status="queued", locked_by=None, run_after=func.now())
    ).rowcount  # type: ignore[attr-defined]
    session.commit()
    return int(failed or 0) + int(requeued or 0)


def backoff_seconds(attempt: int) -> float:
    return float(min(300, 10 * 3 ** (attempt - 1)))
