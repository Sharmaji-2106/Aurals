from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class SoundProfile(UUIDPk, Timestamped, Base):
    """An immutable personal sound profile with references to the evidence it used."""

    __tablename__ = "sound_profiles"
    __table_args__ = (Index("ix_sound_profiles_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    model_version: Mapped[str] = mapped_column(String(32))
    music_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("music_profiles.id", ondelete="SET NULL")
    )
    questionnaire_response_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("questionnaire_responses.id", ondelete="SET NULL")
    )
    profile: Mapped[dict[str, Any]] = mapped_column(JSONB)
