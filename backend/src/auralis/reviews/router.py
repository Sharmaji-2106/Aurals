from __future__ import annotations

from fastapi import APIRouter

from auralis.auth.deps import DbSession
from auralis.reviews.fetchers import get_fetcher
from auralis.reviews.schemas import CollectionsOut, ReviewsOut

router = APIRouter(prefix="/api", tags=["reviews"])


@router.get("/reviews/collections")
def read_collections(db: DbSession) -> CollectionsOut:
    """Which earphones have review evidence gathered, and which one the tour opens on."""
    return get_fetcher().collections(db)


@router.get("/iems/{slug}/reviews")
def read_reviews(slug: str, db: DbSession) -> ReviewsOut:
    """Published reviews and discussions for one earphone, with the themes they support."""
    return get_fetcher().reviews(db, slug)
