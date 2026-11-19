"""Making the questionnaire's listening examples, in the worker.

Fetching and cutting a handful of songs takes tens of seconds, so it is a job:
started when the listener arrives at `/tune` (the listening session gives it
the time it needs), deduplicated per listener and playlist, and read back from
the cache the job writes.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from auralis.db import session_scope
from auralis.jobs.queue import enqueue
from auralis.jobs.registry import JobContext, job_handler
from auralis.tuning.examples import prepare_examples

KIND_EXAMPLES = "tuning.examples"


@job_handler(KIND_EXAMPLES)
def make_examples(payload: dict[str, Any], ctx: JobContext) -> None:
    with session_scope() as s:
        prepare_examples(s, uuid.UUID(payload["user_id"]))


def enqueue_examples(db: Session, user_id: uuid.UUID, submission_id: str) -> bool:
    return enqueue(
        db,
        KIND_EXAMPLES,
        {"user_id": str(user_id)},
        dedupe_key=f"examples:{user_id}:{submission_id}",
        priority=60,
        max_attempts=2,
    )
