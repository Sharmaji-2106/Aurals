"""phase 2: IEM dataset provenance, targets and rig families

Revision ID: 7b1e4d2a9c10
Revises: 2c72af031fea
Create Date: 2026-09-18 23:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7b1e4d2a9c10"
down_revision: str | Sequence[str] | None = "2c72af031fea"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("iems", sa.Column("specs_source_url", sa.Text(), nullable=True))
    op.add_column("iems", sa.Column("specs_retrieved_on", sa.Date(), nullable=True))

    op.add_column("fr_measurements", sa.Column("rig_family", sa.String(length=32), nullable=True))
    op.add_column("fr_measurements", sa.Column("form", sa.String(length=16), nullable=True))
    op.add_column("fr_measurements", sa.Column("variant", sa.String(length=120), nullable=True))
    op.add_column("fr_measurements", sa.Column("source_ref", sa.Text(), nullable=True))
    op.add_column(
        "fr_measurements",
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "fr_targets",
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("rig_family", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("citation", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("source_ref", sa.Text(), nullable=True),
        sa.Column("license", sa.Text(), nullable=True),
        sa.Column("raw_points", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fr_targets")),
        sa.UniqueConstraint("name", name=op.f("uq_fr_targets_name")),
    )

    op.add_column(
        "iem_acoustic_profiles", sa.Column("target_name", sa.String(length=80), nullable=True)
    )
    op.drop_constraint(
        "uq_iem_acoustic_profiles_measurement_id", "iem_acoustic_profiles", type_="unique"
    )
    op.create_unique_constraint(
        "uq_iem_acoustic_profiles_measurement_version_target",
        "iem_acoustic_profiles",
        ["measurement_id", "processor_version", "target_name"],
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_iem_acoustic_profiles_measurement_version_target",
        "iem_acoustic_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_iem_acoustic_profiles_measurement_id",
        "iem_acoustic_profiles",
        ["measurement_id", "processor_version"],
    )
    op.drop_column("iem_acoustic_profiles", "target_name")
    op.drop_table("fr_targets")
    for column in ("retrieved_at", "source_ref", "variant", "form", "rig_family"):
        op.drop_column("fr_measurements", column)
    op.drop_column("iems", "specs_retrieved_on")
    op.drop_column("iems", "specs_source_url")
