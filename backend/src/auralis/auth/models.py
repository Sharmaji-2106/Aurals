from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class User(UUIDPk, Timestamped, Base):
    """An account. Starts anonymous; ``email`` is reserved for optional sign-in later."""

    __tablename__ = "users"

    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuthSession(UUIDPk, Timestamped, Base):
    """A browser session. Only a SHA-256 hash of the bearer token is stored."""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
