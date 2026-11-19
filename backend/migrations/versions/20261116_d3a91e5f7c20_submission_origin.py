"""Who chose a submission's songs: the listener, or AURALS from their genres.

Revision ID: d3a91e5f7c20
Revises: c51e0a7d2b13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d3a91e5f7c20"
down_revision = "c51e0a7d2b13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "music_submissions",
        sa.Column("origin", sa.String(20), nullable=False, server_default="listener"),
    )
    op.add_column(
        "music_submissions",
        sa.Column("origin_genres", sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("music_submissions", "origin_genres")
    op.drop_column("music_submissions", "origin")
