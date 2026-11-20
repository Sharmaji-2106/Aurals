"""Add provenance-carrying multi-image library; preserve all existing rows.

Revision ID: 9a6b43c8e1f0
Revises: 8f3c1d7a4e92
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "9a6b43c8e1f0"
down_revision = "8f3c1d7a4e92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "iem_images",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("iem_id", sa.Uuid(), sa.ForeignKey("iems.id"), nullable=False),
        sa.Column("file_path", sa.String(260), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("derived_from_id", sa.Uuid(), sa.ForeignKey("iem_images.id")),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("format", sa.String(16), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("perceptual_hash", sa.String(64)),
        sa.Column("source_name", sa.String(200), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("credit", sa.Text(), nullable=False),
        sa.Column("retrieved_on", sa.Date(), nullable=False),
        sa.Column("licence_note", sa.Text(), nullable=False),
        sa.Column("verification_status", sa.String(20), nullable=False),
        sa.Column("verification_method", sa.Text()),
        sa.Column("verification_note", sa.Text()),
        sa.Column("quality_score", sa.Numeric(8, 3)),
        sa.Column("processing_notes", sa.Text()),
        sa.UniqueConstraint("iem_id", "file_path"),
    )
    op.create_index("ix_iem_images_iem_id", "iem_images", ["iem_id"])
    op.create_index(
        "uq_iem_images_primary",
        "iem_images",
        ["iem_id"],
        unique=True,
        postgresql_where=sa.text("role = 'primary'"),
    )


def downgrade() -> None:
    raise RuntimeError("Catalogue image migration is additive and has no destructive downgrade")
