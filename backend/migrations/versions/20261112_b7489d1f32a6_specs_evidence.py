"""Label catalogue specification claims without changing existing values.

Revision ID: b7489d1f32a6
Revises: 9a6b43c8e1f0
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b7489d1f32a6"
down_revision = "9a6b43c8e1f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("iems", sa.Column("specs_evidence_type", sa.String(32), nullable=True))


def downgrade() -> None:
    raise RuntimeError("Catalogue evidence migration is additive and has no destructive downgrade")
