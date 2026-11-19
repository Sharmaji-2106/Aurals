from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Integer, SmallInteger, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class Job(UUIDPk, Timestamped, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index(
            "ix_jobs_ready",
            "priority",
            "run_after",
            postgresql_where=text("status = 'queued'"),
        ),
        # At most one live job per dedupe key (e.g. one analysis per track).
        Index(
            "uq_jobs_live_dedupe_key",
            "dedupe_key",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running') AND dedupe_key IS NOT NULL"),
        ),
        Index(
            "ix_jobs_running_heartbeat", "heartbeat_at", postgresql_where=text("status = 'running'")
        ),
    )

    kind: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    priority: Mapped[int] = mapped_column(SmallInteger, default=100)  # lower runs first
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    dedupe_key: Mapped[str | None] = mapped_column(String(200))
    locked_by: Mapped[str | None] = mapped_column(String(100))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
