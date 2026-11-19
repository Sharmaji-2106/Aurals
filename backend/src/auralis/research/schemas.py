"""What the discovery sequence is allowed to know."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

RunStatus = Literal["queued", "running", "succeeded", "partial", "failed"]


class RankedItem(BaseModel):
    """One earphone as the engine ranked it, snapshotted when research began.

    A copy of the recommender's output, kept so the sequence and the results
    page agree across a refresh. `GET /api/recommendations` remains the only
    place a ranking is produced.
    """

    slug: str
    rank: int
    brand: str
    model: str
    mean: float
    low: float
    high: float
    match: str


class Event(BaseModel):
    """One step that actually happened, with the numbers it produced."""

    seq: int
    stage: str
    payload: dict[str, Any] = Field(default_factory=dict)
    at: datetime


class RunOut(BaseModel):
    id: UUID
    status: RunStatus
    provider: str
    #: True once nothing more will arrive, whatever the outcome.
    finished: bool
    ranking: list[RankedItem]
    products_requested: int
    products_with_evidence: int
    sources_kept: int
    claims_made: int
    #: Why research stopped short, when it did. Shown to the listener rather
    #: than leaving an empty section to be misread as "nobody has an opinion".
    error_code: str | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None
    #: Events after the `after_seq` the client asked for, oldest first.
    events: list[Event]
