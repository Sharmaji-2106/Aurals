"""A listener's saved earphones.

Revision ID: 6b2d94af13c7
Revises: 3d8a51c7e9b2
Create Date: 2026-11-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "6b2d94af13c7"
down_revision = "3d8a51c7e9b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "shortlist",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "shortlist")
