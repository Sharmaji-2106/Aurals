"""listening contexts: where the listener intends to use their earphones

Declared context, stored beside the profile. It is shown with a recommendation but is
not an input to the ranking, which comes from measured frequency response.

Revision ID: 4f2a1c8b6d30
Revises: 7b1e4d2a9c10
Create Date: 2026-10-24 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4f2a1c8b6d30"
down_revision: str | Sequence[str] | None = "7b1e4d2a9c10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "use_cases",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column("profiles", sa.Column("primary_use_case", sa.String(length=40), nullable=True))
    op.add_column("profiles", sa.Column("driver_preference", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "driver_preference")
    op.drop_column("profiles", "primary_use_case")
    op.drop_column("profiles", "use_cases")
