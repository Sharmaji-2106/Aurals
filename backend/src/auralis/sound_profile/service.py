from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.analysis.aggregate import MusicProfileData
from auralis.analysis.version import MUSIC_PROFILE_VERSION
from auralis.auth.models import User
from auralis.core.errors import NotFound
from auralis.music.models import MusicProfile
from auralis.profiles.models import Profile
from auralis.questionnaire.models import QuestionnaireResponse
from auralis.sound_profile.fusion import MODEL_VERSION, ListeningEvidence, SoundProfileData, fuse
from auralis.sound_profile.models import SoundProfile
from auralis.tuning.models import TuningSession


class SoundProfileOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    music_profile_id: uuid.UUID | None
    questionnaire_response_id: uuid.UUID | None
    data: SoundProfileData


class SoundProfilePreview(BaseModel):
    """What the profile would look like with these answers (nothing is stored)."""

    baseline: SoundProfileData
    preview: SoundProfileData


def _latest[T: (MusicProfile, QuestionnaireResponse)](
    db: Session, model: type[T], user_id: uuid.UUID
) -> T | None:
    return db.scalar(
        select(model).where(model.user_id == user_id).order_by(model.created_at.desc()).limit(1)
    )


def listening_evidence(db: Session, user_id: uuid.UUID) -> ListeningEvidence | None:
    """The latest listening session, as observations for the profile."""
    from auralis.tuning.inference import observations

    row = db.scalar(
        select(TuningSession)
        .where(TuningSession.user_id == user_id)
        .order_by(TuningSession.created_at.desc())
        .limit(1)
    )
    if row is None:
        return None
    device = row.device or {}
    obs = observations(
        shape=row.shape,
        choices=row.choices,
        device_offsets=device.get("offsets") if device.get("kind") == "catalogue" else None,
        device_label=device.get("label"),
    )
    return {dim: [(o.value, o.variance, o.note) for o in items] for dim, items in obs.items()}


def rebuild_sound_profile(db: Session, user_id: uuid.UUID) -> SoundProfile:
    """Fuse the latest evidence into a new immutable SoundProfile row."""
    music = _latest(db, MusicProfile, user_id)
    answers = _latest(db, QuestionnaireResponse, user_id)
    stated = db.get(Profile, user_id)
    data = fuse(
        music=MusicProfileData.model_validate(music.profile) if music else None,
        answers=answers.answers if answers else None,
        listening=listening_evidence(db, user_id),
        genres=list(stated.use_cases or []) if stated else [],
        primary_genre=stated.primary_use_case if stated else None,
    )
    row = SoundProfile(
        user_id=user_id,
        model_version=MODEL_VERSION,
        music_profile_id=music.id if music else None,
        questionnaire_response_id=answers.id if answers else None,
        profile=data.model_dump(mode="json"),
    )
    db.add(row)
    db.flush()
    return row


def to_out(row: SoundProfile) -> SoundProfileOut:
    return SoundProfileOut(
        id=row.id,
        created_at=row.created_at,
        music_profile_id=row.music_profile_id,
        questionnaire_response_id=row.questionnaire_response_id,
        data=SoundProfileData.model_validate(row.profile),
    )


def preview_sound_profile(
    db: Session, user: User, answers: dict[str, str | None]
) -> SoundProfilePreview:
    music_row = _latest(db, MusicProfile, user.id)
    music = MusicProfileData.model_validate(music_row.profile) if music_row else None
    listening = listening_evidence(db, user.id)
    return SoundProfilePreview(
        baseline=fuse(music=music, answers=None, listening=listening),
        preview=fuse(music=music, answers=answers, listening=listening),
    )


def latest_sound_profile(db: Session, user: User) -> SoundProfileOut:
    row = db.scalar(
        select(SoundProfile)
        .where(SoundProfile.user_id == user.id)
        .order_by(SoundProfile.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise NotFound("No sound profile yet.", code="no_sound_profile")
    music = _latest(db, MusicProfile, user.id)
    stale_music = music is not None and music.version != MUSIC_PROFILE_VERSION
    if row.model_version != MODEL_VERSION or stale_music:
        # Profiles are immutable: newer models get new rows, built from the same stored
        # evidence (analyses and answers), and the old rows are kept for provenance.
        from auralis.music.pipeline import rebuild_music_profile

        if stale_music:
            rebuild_music_profile(db, user.id)
        row = rebuild_sound_profile(db, user.id)
        db.commit()
    return to_out(row)
