"""Community research runs, their progress log, and product imagery.

Revision ID: 8f3c1d7a4e92
Revises: 6b2d94af13c7
Create Date: 2026-11-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "8f3c1d7a4e92"
down_revision = "6b2d94af13c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sound_profile_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column(
            "ranking",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("products_requested", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("products_with_evidence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sources_kept", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claims_made", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sound_profile_id"], ["sound_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_research_runs_user_created", "research_runs", ["user_id", "created_at"])
    op.create_index("ix_research_runs_status", "research_runs", ["status"])

    op.create_table(
        "research_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.ForeignKeyConstraint(["run_id"], ["research_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "seq", name="uq_research_events_run_seq"),
    )
    op.create_index("ix_research_events_run_id", "research_events", ["run_id"])
    op.create_index("ix_research_events_run_seq", "research_events", ["run_id", "seq"])

    # Product imagery, with the provenance every other external asset in this
    # schema carries: where it came from, who to credit, when it was fetched.
    op.add_column("iems", sa.Column("image_path", sa.String(length=260), nullable=True))
    op.add_column("iems", sa.Column("image_source", sa.String(length=200), nullable=True))
    op.add_column("iems", sa.Column("image_source_url", sa.Text(), nullable=True))
    op.add_column("iems", sa.Column("image_credit", sa.Text(), nullable=True))
    op.add_column("iems", sa.Column("image_retrieved_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("iems", "image_retrieved_on")
    op.drop_column("iems", "image_credit")
    op.drop_column("iems", "image_source_url")
    op.drop_column("iems", "image_source")
    op.drop_column("iems", "image_path")

    op.drop_index("ix_research_events_run_seq", table_name="research_events")
    op.drop_index("ix_research_events_run_id", table_name="research_events")
    op.drop_table("research_events")

    op.drop_index("ix_research_runs_status", table_name="research_runs")
    op.drop_index("ix_research_runs_user_created", table_name="research_runs")
    op.drop_table("research_runs")
