"""Spotify playlist import: source artwork and per-track import provenance.

Revision ID: 3d8a51c7e9b2
Revises: 9c4e7a2b1f55
Create Date: 2026-11-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "3d8a51c7e9b2"
down_revision = "9c4e7a2b1f55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "submission_sources", sa.Column("cover_url", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "submission_tracks",
        sa.Column("imported", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("submission_tracks", "imported")
    op.drop_column("submission_sources", "cover_url")
