"""review evidence: published reviews and the passages quoted from them

Subjective impressions live in their own tables and never mix with measurements.

Revision ID: 9c4e7a2b1f55
Revises: 4f2a1c8b6d30
Create Date: 2026-10-24 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9c4e7a2b1f55"
down_revision: str | Sequence[str] | None = "4f2a1c8b6d30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "iem_review_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("iem_id", sa.Uuid(), nullable=False),
        sa.Column("collection", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("publication", sa.String(length=120), nullable=False),
        sa.Column("author", sa.String(length=120), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("published_on", sa.Date(), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("license_note", sa.Text(), nullable=True),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["iem_id"], ["iems.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("iem_id", "url"),
    )
    op.create_index(op.f("ix_iem_review_sources_iem_id"), "iem_review_sources", ["iem_id"])
    op.create_index(op.f("ix_iem_review_sources_collection"), "iem_review_sources", ["collection"])

    op.create_table(
        "iem_review_claims",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("topic", sa.String(length=32), nullable=False),
        sa.Column("stance", sa.String(length=16), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("tagged_by", sa.String(length=40), nullable=False),
        sa.Column("tagged_on", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["iem_review_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_iem_review_claims_source_id"), "iem_review_claims", ["source_id"])
    op.create_index(op.f("ix_iem_review_claims_topic"), "iem_review_claims", ["topic"])


def downgrade() -> None:
    op.drop_table("iem_review_claims")
    op.drop_table("iem_review_sources")
