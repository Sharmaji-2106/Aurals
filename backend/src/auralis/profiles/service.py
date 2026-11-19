from __future__ import annotations

import time

from psycopg import errors as pg_errors
from sqlalchemy import delete, exists, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from auralis.auth.models import User
from auralis.core.errors import NotFound
from auralis.music.models import MusicProfile, MusicSubmission
from auralis.profiles.models import Profile
from auralis.profiles.schemas import Journey, MeOut, ProfileOut, ProfileUpdate
from auralis.questionnaire.models import QuestionnaireResponse
from auralis.sound_profile.models import SoundProfile

ACTIVE_STATUSES = ("queued", "resolving", "analyzing", "aggregating")


def create_user(db: Session, display_name: str) -> User:
    user = User()
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id, display_name=display_name, current_gear=[]))
    return user


def get_profile(db: Session, user: User) -> Profile:
    profile = db.get(Profile, user.id)
    if profile is None:
        raise NotFound("Profile not found.")
    return profile


def update_profile(db: Session, user: User, patch: ProfileUpdate) -> Profile:
    profile = get_profile(db, user)
    changes = patch.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "display_name" and value is None:
            continue
        setattr(profile, field, value)
    if (
        profile.budget_min is not None
        and profile.budget_max is not None
        and profile.budget_min > profile.budget_max
    ):
        profile.budget_min, profile.budget_max = profile.budget_max, profile.budget_min
    # A primary use case the listener has since deselected is no longer theirs.
    if profile.primary_use_case is not None and profile.primary_use_case not in profile.use_cases:
        profile.primary_use_case = None
    return profile


def journey(db: Session, user: User) -> Journey:
    latest = db.execute(
        select(MusicSubmission.id, MusicSubmission.status)
        .where(MusicSubmission.user_id == user.id)
        .order_by(MusicSubmission.created_at.desc())
        .limit(1)
    ).one_or_none()
    active = latest.id if latest and latest.status in ACTIVE_STATUSES else None

    def has(model: type[MusicProfile] | type[QuestionnaireResponse] | type[SoundProfile]) -> bool:
        return bool(db.scalar(select(exists().where(model.user_id == user.id))))

    has_music, has_answers, has_sound = (
        has(MusicProfile),
        has(QuestionnaireResponse),
        has(SoundProfile),
    )
    if not has_music and latest is None:
        step = "add_music"
    elif active and not has_answers:
        step = "questionnaire"  # answer questions while the music is analysed
    elif active:
        step = "processing"
    elif not has_music:
        step = "add_music"  # the last attempt failed
    elif not has_answers:
        step = "questionnaire"
    else:
        step = "sound_profile"
    return Journey(
        next_step=step,
        active_submission_id=active,
        latest_submission_id=latest.id if latest else None,
        has_music_profile=has_music,
        has_questionnaire=has_answers,
        has_sound_profile=has_sound,
    )


def me(db: Session, user: User) -> MeOut:
    return MeOut(
        id=user.id,
        profile=ProfileOut.model_validate(get_profile(db, user)),
        journey=journey(db, user),
    )


def delete_account(db: Session, user: User) -> None:
    """Remove the user and everything owned by them (FK cascades).

    Shared track analyses are not personal data and are kept.
    """
    db.execute(delete(User).where(User.id == user.id))
    from auralis.tuning.clip import delete_clip
    from auralis.tuning.examples import delete_examples

    delete_clip(user.id)
    delete_examples(user.id)


DELETE_ATTEMPTS = 3


def delete_account_now(db: Session, user: User, *, pause: float = 0.2) -> None:
    """Delete and commit, retrying when Postgres breaks a deadlock against us.

    The cascade from ``users`` reaches rows a background job may be writing at
    that moment (a community research run updating its own status), and the two
    can lock in opposite orders. Postgres resolves that by aborting one side; if
    it is this side, the delete is simply run again. A listener asking for their
    data to be removed must never be told "something went wrong" because work
    on their behalf happened to be running.
    """
    user_id = user.id
    for attempt in range(1, DELETE_ATTEMPTS + 1):
        try:
            delete_account(db, db.get(User, user_id) or user)
            db.commit()
            return
        except OperationalError as exc:
            db.rollback()
            if not isinstance(exc.orig, pg_errors.DeadlockDetected) or attempt == DELETE_ATTEMPTS:
                raise
            time.sleep(pause * attempt)
