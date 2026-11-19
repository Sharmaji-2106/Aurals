"""Job handler registry.

A handler receives the job payload and a :class:`JobContext`. Raising
:class:`PermanentJobError` fails the job immediately; any other exception is retried
with backoff until ``max_attempts``. ``on_exhausted`` runs once when a job gives up,
so domain state (e.g. a track's status) never stays stuck in "processing".
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from auralis.jobs.queue import ClaimedJob


class PermanentJobError(Exception):
    """The job can never succeed; don't retry."""


class RetryJob(Exception):
    """Retry after a specific delay (still counts as an attempt)."""

    def __init__(self, message: str, *, delay_seconds: float) -> None:
        super().__init__(message)
        self.delay_seconds = delay_seconds


@dataclass(frozen=True, slots=True)
class JobContext:
    job: ClaimedJob
    worker_id: str


Handler = Callable[[dict[str, Any], JobContext], None]
ExhaustedHook = Callable[[dict[str, Any], str], None]


@dataclass(frozen=True, slots=True)
class Registration:
    handler: Handler
    on_exhausted: ExhaustedHook | None


_REGISTRY: dict[str, Registration] = {}


def job_handler(
    kind: str, *, on_exhausted: ExhaustedHook | None = None
) -> Callable[[Handler], Handler]:
    def decorator(fn: Handler) -> Handler:
        if kind in _REGISTRY:
            raise RuntimeError(f"duplicate job handler for {kind!r}")
        _REGISTRY[kind] = Registration(fn, on_exhausted)
        return fn

    return decorator


def get(kind: str) -> Registration | None:
    return _REGISTRY.get(kind)


def load_handlers() -> None:
    """Import every ORM model (so foreign keys resolve) and the modules that register handlers."""
    import auralis.models
    import auralis.music.pipeline
    import auralis.research.jobs
    import auralis.tuning.jobs  # noqa: F401
