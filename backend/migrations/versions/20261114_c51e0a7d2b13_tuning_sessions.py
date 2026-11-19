"""Listening sessions: the shape picked and the A/B tuning choices.

Revision ID: c51e0a7d2b13
Revises: b7489d1f32a6
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c51e0a7d2b13"
down_revision = "b7489d1f32a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tuning_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("shape", sa.String(32), nullable=True),
        sa.Column("device", postgresql.JSONB(), nullable=True),
        sa.Column("clip", postgresql.JSONB(), nullable=True),
        sa.Column("choices", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_tuning_sessions_user_created", "tuning_sessions", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_tuning_sessions_user_created", table_name="tuning_sessions")
    op.drop_table("tuning_sessions")
