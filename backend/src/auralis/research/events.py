"""Writing a run's progress, one committed row at a time.

This is the whole of the "real backend progress" mechanism. There is no socket
and no event stream in this project; a step records what it did and the client
polls for anything newer than it has seen. That is deliberately the same shape
the music pipeline already uses, and it buys two properties worth more than a
push channel: a refresh replays the run exactly as it happened, and a crash
leaves every completed step on disk.

``emit`` owns its own transaction so an event is durable the moment it is
written, independent of whatever the caller is doing. A failure to record
progress must never take down the work being reported, so it logs and returns.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import func, select

from auralis.db import session_scope
from auralis.research.models import ResearchEvent, ResearchRun

log = logging.getLogger(__name__)


def emit(run_id: uuid.UUID, stage: str, payload: dict[str, Any] | None = None) -> None:
    """Append one event to a run.

    ``payload`` carries only values the backend computed. A stage with nothing
    real to report gets an empty payload rather than a plausible-looking one.
    """
    try:
        with session_scope() as s:
            # The listener can delete their account while a job is still in
            # flight, which cascades the run away underneath it. That is the
            # delete working correctly, not a failure, so there is nothing to
            # record and nothing to complain about.
            if s.get(ResearchRun, run_id) is None:
                return
            # One writer per run (the job), so the next sequence is a read.
            # The unique constraint on (run_id, seq) is the backstop if that
            # ever stops being true.
            last = s.scalar(
                select(func.max(ResearchEvent.seq)).where(ResearchEvent.run_id == run_id)
            )
            s.add(
                ResearchEvent(
                    run_id=run_id,
                    seq=(last or 0) + 1,
                    stage=stage,
                    payload=_clean(payload or {}),
                )
            )
    except Exception:
        log.exception("could not record %s for run %s", stage, run_id)


def _clean(payload: dict[str, Any]) -> dict[str, Any]:
    """Drop nulls and keep the payload small enough to poll repeatedly."""
    out: dict[str, Any] = {}
    for key, value in payload.items():
        if value is None:
            continue
        if isinstance(value, str):
            out[key] = value[:400]
        elif isinstance(value, list):
            out[key] = [v[:200] if isinstance(v, str) else v for v in value[:12]]
        else:
            out[key] = value
    return out
