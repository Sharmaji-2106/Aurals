from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class TuningSession(UUIDPk, Timestamped, Base):
    """One listening session: the shape picked, the A/B choices made, on what device.

    Append-only like questionnaire responses: retaking it adds a row. Stores the
    choices themselves (not the inferred values), so the evidence can be re-read by
    newer models. No audio is stored here.
    """

    __tablename__ = "tuning_sessions"
    __table_args__ = (Index("ix_tuning_sessions_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    version: Mapped[str] = mapped_column(String(32))
    shape: Mapped[str | None] = mapped_column(String(32), nullable=True)
    device: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    clip: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    choices: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
