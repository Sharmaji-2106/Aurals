from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select

from auralis.auth.deps import CurrentUser, DbSession
from auralis.core.errors import DomainError
from auralis.questionnaire.definition import (
    QUESTIONNAIRE,
    QUESTIONNAIRE_VERSION,
    AnswerError,
    Questionnaire,
    validate_answers,
)
from auralis.questionnaire.models import QuestionnaireResponse
from auralis.sound_profile.service import SoundProfileOut, rebuild_sound_profile, to_out

router = APIRouter(prefix="/api/questionnaire", tags=["questionnaire"])

AnswerValue = Annotated[str, StringConstraints(max_length=32)]


class ResponseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    answers: dict[str, AnswerValue | None] = Field(max_length=50)


class StoredResponse(BaseModel):
    version: str
    answers: dict[str, str | None]
    created_at: datetime


class LatestResponse(BaseModel):
    response: StoredResponse | None


@router.get("")
def read_questionnaire() -> Questionnaire:
    return QUESTIONNAIRE


@router.get("/responses/latest")
def read_latest_response(user: CurrentUser, db: DbSession) -> LatestResponse:
    """The listener's most recent answers (to prefill a retake), if any."""
    row = db.scalar(
        select(QuestionnaireResponse)
        .where(QuestionnaireResponse.user_id == user.id)
        .order_by(QuestionnaireResponse.created_at.desc())
        .limit(1)
    )
    if row is None:
        return LatestResponse(response=None)
    return LatestResponse(
        response=StoredResponse(
            version=row.questionnaire_version, answers=row.answers, created_at=row.created_at
        )
    )


@router.post("/responses", status_code=status.HTTP_201_CREATED)
def submit_responses(body: ResponseCreate, user: CurrentUser, db: DbSession) -> SoundProfileOut:
    """Store answers and return the refreshed personal sound profile."""
    if body.version != QUESTIONNAIRE_VERSION:
        raise DomainError(
            "The questionnaire has changed; please reload.", code="stale_questionnaire"
        )
    try:
        answers = validate_answers(body.answers)
    except AnswerError as exc:
        raise DomainError(str(exc), code="invalid_answers") from exc
    db.add(
        QuestionnaireResponse(
            user_id=user.id, questionnaire_version=QUESTIONNAIRE_VERSION, answers=answers
        )
    )
    db.flush()
    profile = rebuild_sound_profile(db, user.id)
    db.commit()
    return to_out(profile)
