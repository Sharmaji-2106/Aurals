from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from auralis.auth.deps import CurrentUser, DbSession
from auralis.recommend.service import RecommendationsOut, recommendations_for

router = APIRouter(prefix="/api", tags=["recommendations"])


@router.get("/recommendations")
def read_recommendations(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=30)] = 10,
) -> RecommendationsOut:
    """Measured IEMs ranked against the listener's personal target, with reasons."""
    return recommendations_for(db, user, limit)
