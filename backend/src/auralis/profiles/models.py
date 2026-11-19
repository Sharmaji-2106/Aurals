from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base


class Profile(Base):
    """Listener-facing profile. Every field except the name is optional and collected late."""

    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            "experience IS NULL OR experience IN ('new', 'casual', 'enthusiast')",
            name="experience",
        ),
        CheckConstraint(
            "budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max",
            name="budget_order",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str] = mapped_column(String(60))
    country_code: Mapped[str | None] = mapped_column(String(2))
    currency: Mapped[str | None] = mapped_column(String(3))
    budget_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    experience: Mapped[str | None] = mapped_column(String(20))
    current_gear: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    # Where the listener intends to use their earphones. Declared context, kept beside
    # the profile and shown with a recommendation; it is not an input to the ranking,
    # which comes from measured frequency response (see recommend/harman.py).
    use_cases: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    primary_use_case: Mapped[str | None] = mapped_column(String(40))
    driver_preference: Mapped[str | None] = mapped_column(String(40))
    # Earphones the listener set aside to come back to. Slugs, in the order they
    # saved them. Declared interest only; the recommender never reads it.
    shortlist: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
