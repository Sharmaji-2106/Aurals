"""The store's routes: public, and personal where a listener has a sound profile."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from auralis.auth.deps import DbSession, OptionalUser
from auralis.core.errors import NotFound
from auralis.sound_profile.fusion import SoundProfileData
from auralis.sound_profile.models import SoundProfile
from auralis.store import listen, service
from auralis.store.service import Kind, Sort
from auralis.tuning.models import TuningSession

router = APIRouter(prefix="/api/store", tags=["store"])


def _profile(db: DbSession, user: OptionalUser) -> tuple[str, SoundProfileData] | None:
    if user is None:
        return None
    row = db.scalar(
        select(SoundProfile)
        .where(SoundProfile.user_id == user.id)
        .order_by(SoundProfile.created_at.desc())
        .limit(1)
    )
    return (str(row.id), SoundProfileData.model_validate(row.profile)) if row else None


@router.get("/products")
def browse(
    db: DbSession,
    user: OptionalUser,
    q: Annotated[str, Query(max_length=80)] = "",
    kind: Kind | None = None,
    brand: Annotated[str | None, Query(max_length=80)] = None,
    min_inr: Annotated[int | None, Query(ge=0)] = None,
    max_inr: Annotated[int | None, Query(ge=0)] = None,
    with_photo: bool = False,
    sort: Sort = "featured",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=96)] = 48,
) -> service.StorePage:
    return service.browse(
        db,
        profile=_profile(db, user),
        q=q,
        kind=kind,
        brand=brand,
        min_inr=min_inr,
        max_inr=max_inr,
        with_photo=with_photo,
        sort=sort,
        offset=offset,
        limit=limit,
    )


@router.get("/products/{slug}")
def product(slug: str, db: DbSession, user: OptionalUser) -> service.StoreProduct:
    found = service.product(db, slug, profile=_profile(db, user))
    if found is None:
        raise NotFound("No product by that name.", code="no_product")
    return found


def _wearing(db: DbSession, user: OptionalUser) -> str | None:
    """The measured earphone the listener said they wear, from their latest session."""
    if user is None:
        return None
    device = db.scalar(
        select(TuningSession.device)
        .where(TuningSession.user_id == user.id)
        .order_by(TuningSession.created_at.desc())
        .limit(1)
    )
    if isinstance(device, dict) and device.get("kind") == "catalogue":
        slug = device.get("slug")
        return slug if isinstance(slug, str) else None
    return None


@router.get("/products/{slug}/listen")
def listening_curve(
    slug: str,
    db: DbSession,
    user: OptionalUser,
    against: Annotated[str | None, Query(max_length=200)] = None,
) -> listen.ListenCurve:
    """How to re-shape music so it takes on this earphone's measured tuning.

    ``against`` is a measured earphone's slug, or ``target`` for the reference; left
    out, the earphone the listener said they wear is used when it is measured on the
    same rig, and the reference otherwise.
    """
    baseline = None if against == "target" else (against or _wearing(db, user))
    found = listen.listen_curve(db, slug, against=baseline)
    if found is None:
        raise NotFound(
            "This one has no measurement on the reference rig, so it can't be heard.",
            code="not_listenable",
        )
    return found
