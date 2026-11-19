from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class QuestionnaireResponse(UUIDPk, Timestamped, Base):
    """Append-only: retaking the questionnaire adds a row, history is kept."""

    __tablename__ = "questionnaire_responses"
    __table_args__ = (Index("ix_questionnaire_responses_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    questionnaire_version: Mapped[str] = mapped_column(String(32))
    answers: Mapped[dict[str, Any]] = mapped_column(JSONB)
