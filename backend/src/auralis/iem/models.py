"""IEM catalogue and measured acoustics.

Design rules:

* Measurements keep their raw points and provenance forever; derived profiles are
  separate rows keyed by processor version.
* Prices are observations with a source and a date, not a property of the model.
* Nothing is required that we might not know. Unknown stays NULL.
* Subjective review data will live in its own tables, never mixed into measurements.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class Iem(UUIDPk, Timestamped, Base):
    __tablename__ = "iems"
    __table_args__ = (UniqueConstraint("brand", "model"),)

    brand: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(150))
    slug: Mapped[str] = mapped_column(String(260), unique=True)
    # e.g. {"dynamic": 1, "balanced_armature": 4, "notes": "..."}; NULL when unknown.
    driver_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    release_year: Mapped[int | None] = mapped_column(SmallInteger)
    availability: Mapped[str | None] = mapped_column(String(20))  # available | discontinued
    # Where driver configuration, release year and availability came from.
    specs_source_url: Mapped[str | None] = mapped_column(Text)
    specs_retrieved_on: Mapped[date | None] = mapped_column(Date)
    specs_evidence_type: Mapped[str | None] = mapped_column(String(32))
    # A real photograph of the product, when one has been gathered. The
    # measurement source carries no imagery, so these are filled in by hand for
    # a curated subset and stay NULL for the rest — which the interface says
    # plainly rather than substituting a stand-in that looks like a photo.
    image_path: Mapped[str | None] = mapped_column(String(260))
    image_source: Mapped[str | None] = mapped_column(String(200))
    image_source_url: Mapped[str | None] = mapped_column(Text)
    image_credit: Mapped[str | None] = mapped_column(Text)
    image_retrieved_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class IemPriceObservation(UUIDPk, Base):
    __tablename__ = "iem_price_observations"

    iem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iems.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    region: Mapped[str | None] = mapped_column(String(2))
    source: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(Text)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IemImage(UUIDPk, Base):
    """An authentic source image or a traceable display derivative."""

    __tablename__ = "iem_images"
    __table_args__ = (UniqueConstraint("iem_id", "file_path"),)

    iem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iems.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(260))
    role: Mapped[str] = mapped_column(String(20))  # primary | alternate | original
    derived_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("iem_images.id"))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    format: Mapped[str] = mapped_column(String(16))
    byte_size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    perceptual_hash: Mapped[str | None] = mapped_column(String(64))
    source_name: Mapped[str] = mapped_column(String(200))
    page_url: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(Text)
    credit: Mapped[str] = mapped_column(Text)
    retrieved_on: Mapped[date] = mapped_column(Date)
    licence_note: Mapped[str] = mapped_column(Text)
    verification_status: Mapped[str] = mapped_column(String(20))
    verification_method: Mapped[str | None] = mapped_column(Text)
    verification_note: Mapped[str | None] = mapped_column(Text)
    quality_score: Mapped[float | None] = mapped_column(Numeric(8, 3))
    processing_notes: Mapped[str | None] = mapped_column(Text)


class FrMeasurement(UUIDPk, Base):
    """A raw frequency-response measurement exactly as received, with provenance."""

    __tablename__ = "fr_measurements"
    __table_args__ = (UniqueConstraint("iem_id", "checksum"),)

    iem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("iems.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(Text)
    rig: Mapped[str | None] = mapped_column(String(200))
    measured_on: Mapped[date | None] = mapped_column(Date)
    channel: Mapped[str | None] = mapped_column(String(8))  # L | R | avg
    # Rigs within a family are comparable; targets only apply within their family.
    rig_family: Mapped[str | None] = mapped_column(String(32))
    form: Mapped[str | None] = mapped_column(String(16))  # in-ear | earbud
    # Measured configuration when not stock, e.g. "foam eartips" or "ANC off".
    variant: Mapped[str | None] = mapped_column(String(120))
    # Exact origin inside a dataset, e.g. "AutoEq@<commit>:measurements/.../X.csv".
    source_ref: Mapped[str | None] = mapped_column(Text)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    license: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    raw_points: Mapped[list[list[float]]] = mapped_column(JSONB)
    checksum: Mapped[str] = mapped_column(String(64))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class FrTarget(UUIDPk, Timestamped, Base):
    """A published target curve, stored like a measurement: raw points and provenance."""

    __tablename__ = "fr_targets"

    name: Mapped[str] = mapped_column(String(80), unique=True)  # e.g. harman-ie-2019
    label: Mapped[str] = mapped_column(String(200))
    rig_family: Mapped[str] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)
    citation: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str | None] = mapped_column(Text)
    source_ref: Mapped[str | None] = mapped_column(Text)
    license: Mapped[str | None] = mapped_column(Text)
    raw_points: Mapped[list[list[float]]] = mapped_column(JSONB)
    checksum: Mapped[str] = mapped_column(String(64))


class IemAcousticProfile(UUIDPk, Timestamped, Base):
    """Processed curve and features for one measurement, processor version and target."""

    __tablename__ = "iem_acoustic_profiles"
    __table_args__ = (
        UniqueConstraint(
            "measurement_id",
            "processor_version",
            "target_name",
            name="uq_iem_acoustic_profiles_measurement_version_target",
            postgresql_nulls_not_distinct=True,
        ),
    )

    measurement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fr_measurements.id", ondelete="CASCADE")
    )
    processor_version: Mapped[str] = mapped_column(String(32))
    target_name: Mapped[str | None] = mapped_column(String(80))
    grid_db: Mapped[list[float | None]] = mapped_column(JSONB)
    features: Mapped[dict[str, Any]] = mapped_column(JSONB)
