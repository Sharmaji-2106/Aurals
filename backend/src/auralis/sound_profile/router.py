from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from auralis.auth.deps import CurrentUser, DbSession
from auralis.core.errors import DomainError
from auralis.questionnaire.definition import AnswerError, validate_answers
from auralis.sound_profile.service import (
    SoundProfileOut,
    SoundProfilePreview,
    latest_sound_profile,
    preview_sound_profile,
)

router = APIRouter(prefix="/api", tags=["sound-profile"])


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[str, Annotated[str, StringConstraints(max_length=32)] | None] = Field(
        max_length=50
    )


@router.get("/sound-profile")
def read_sound_profile(user: CurrentUser, db: DbSession) -> SoundProfileOut:
    return latest_sound_profile(db, user)


@router.post("/sound-profile/preview")
def preview(body: PreviewRequest, user: CurrentUser, db: DbSession) -> SoundProfilePreview:
    """Fuse the latest music profile with draft answers, without saving anything."""
    try:
        answers = validate_answers(body.answers)
    except AnswerError as exc:
        raise DomainError(str(exc), code="invalid_answers") from exc
    return preview_sound_profile(db, user, answers)
