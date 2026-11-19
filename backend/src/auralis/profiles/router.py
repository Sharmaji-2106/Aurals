from __future__ import annotations

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from auralis.auth.deps import (
    CurrentUser,
    DbSession,
    OptionalUser,
    clear_session_cookie,
    set_session_cookie,
)
from auralis.auth.service import create_session
from auralis.profiles import service
from auralis.profiles.schemas import MeOut, ProfileOut, ProfileUpdate, SessionCreate, SessionOut

router = APIRouter(prefix="/api", tags=["account"])


@router.post("/session", status_code=status.HTTP_201_CREATED)
def start_session(body: SessionCreate, response: Response, db: DbSession) -> MeOut:
    """Create an anonymous account with a display name and sign the browser in."""
    user = service.create_user(db, body.display_name)
    token = create_session(db, user)
    db.commit()
    set_session_cookie(response, token)
    return service.me(db, user)


@router.get("/session")
def read_session(user: OptionalUser, db: DbSession) -> SessionOut:
    """Who is signed in, if anyone. Never fails for anonymous visitors."""
    return SessionOut(me=service.me(db, user) if user else None)


@router.get("/me")
def read_me(user: CurrentUser, db: DbSession) -> MeOut:
    return service.me(db, user)


@router.patch("/me/profile")
def patch_profile(body: ProfileUpdate, user: CurrentUser, db: DbSession) -> ProfileOut:
    from auralis.sound_profile.models import SoundProfile
    from auralis.sound_profile.service import rebuild_sound_profile

    changes = body.model_dump(exclude_unset=True)
    profile = service.update_profile(db, user, body)
    # Stated genres lean the sound profile (see fusion.GENRE_LEAN): a listener
    # who already has one gets it rebuilt, so their results follow at once.
    if {"use_cases", "primary_use_case"} & changes.keys() and db.scalar(
        select(SoundProfile.id).where(SoundProfile.user_id == user.id).limit(1)
    ):
        db.flush()
        rebuild_sound_profile(db, user.id)
    db.commit()
    return ProfileOut.model_validate(profile)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(user: CurrentUser, db: DbSession) -> Response:
    """Permanently delete the account and all personal data."""
    service.delete_account_now(db, user)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
