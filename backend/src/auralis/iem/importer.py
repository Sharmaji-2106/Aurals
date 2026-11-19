"""Import raw frequency-response measurements with provenance.

Only real measurements with a named source should ever be imported. The importer
refuses exact duplicates and never alters the raw points it stores.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.acoustics import fr
from auralis.core.errors import Conflict
from auralis.db import session_scope
from auralis.iem.models import FrMeasurement, FrTarget, Iem, IemAcousticProfile

# The reference target preference offsets and IEM features are expressed against.
DEFAULT_TARGET = "harman-ie-2019"


def parse_points(text: str) -> list[list[float]]:
    """Read two numeric columns from CSV/TSV/whitespace text, skipping headers and comments."""
    points = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "*", "//")):
            continue
        cells = [c for c in re.split(r"[,;\s]+", line) if c]
        if len(cells) < 2:
            continue
        try:
            points.append([float(cells[0]), float(cells[1])])
        except ValueError:
            continue  # header or annotation line
    return points


def slugify(*parts: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", " ".join(parts).lower()).strip("-")


def checksum(points: list[list[float]]) -> str:
    return hashlib.sha256(json.dumps(points, separators=(",", ":")).encode()).hexdigest()


def get_or_create_iem(session: Session, brand: str, model: str) -> Iem:
    iem = session.scalar(select(Iem).where(Iem.brand == brand, Iem.model == model))
    if iem is None:
        iem = Iem(brand=brand, model=model, slug=slugify(brand, model))
        session.add(iem)
        session.flush()
    return iem


def target_curve(session: Session, name: str) -> tuple[FrTarget, fr.Curve] | None:
    """A stored target on the common grid, or None when it hasn't been imported."""
    target = session.scalar(select(FrTarget).where(FrTarget.name == name))
    if target is None:
        return None
    return target, fr.to_grid(fr.validate_points(target.raw_points))


def process_measurement(
    session: Session, measurement: FrMeasurement, target_name: str | None = DEFAULT_TARGET
) -> IemAcousticProfile | None:
    """Store the processed representation of a measurement against a target.

    Skipped (None) when the target is missing or belongs to another rig family: a
    target is only meaningful on the kind of fixture it was defined on.
    """
    target = target_curve(session, target_name) if target_name else None
    if target_name and (target is None or target[0].rig_family != measurement.rig_family):
        return None
    existing = session.scalar(
        select(IemAcousticProfile).where(
            IemAcousticProfile.measurement_id == measurement.id,
            IemAcousticProfile.processor_version == fr.FR_PROCESSOR_VERSION,
            IemAcousticProfile.target_name == target_name,
        )
    )
    if existing is not None:
        return existing
    curve, features = fr.process(
        measurement.raw_points,
        target=target[1] if target else None,
        target_name=target_name,
        rig_family=measurement.rig_family,
    )
    profile = IemAcousticProfile(
        measurement_id=measurement.id,
        processor_version=fr.FR_PROCESSOR_VERSION,
        target_name=target_name,
        grid_db=[None if v != v else round(float(v), 3) for v in curve.db],  # NaN -> null
        features=features.model_dump(mode="json"),
    )
    session.add(profile)
    session.flush()
    return profile


def import_points(
    session: Session,
    points: list[list[float]],
    *,
    brand: str,
    model: str,
    source: str,
    source_url: str | None = None,
    rig: str | None = None,
    rig_family: str | None = None,
    form: str | None = None,
    variant: str | None = None,
    source_ref: str | None = None,
    retrieved_at: datetime | None = None,
    license: str | None = None,
    notes: str | None = None,
) -> FrMeasurement:
    fr.validate_points(points)
    iem = get_or_create_iem(session, brand.strip(), model.strip())
    digest = checksum(points)
    if session.scalar(
        select(FrMeasurement.id).where(
            FrMeasurement.iem_id == iem.id, FrMeasurement.checksum == digest
        )
    ):
        raise Conflict("This measurement is already stored.", code="duplicate_measurement")
    measurement = FrMeasurement(
        iem_id=iem.id,
        source=source,
        source_url=source_url,
        rig=rig,
        rig_family=rig_family,
        form=form,
        variant=variant,
        source_ref=source_ref,
        retrieved_at=retrieved_at,
        license=license,
        notes=notes,
        raw_points=points,
        checksum=digest,
    )
    session.add(measurement)
    session.flush()
    process_measurement(session, measurement, None)  # levels only, always possible
    process_measurement(session, measurement)  # errors against the reference target
    return measurement


def import_csv(path: Path, **kwargs: str | None) -> uuid.UUID:
    points = parse_points(path.read_text(encoding="utf-8-sig"))
    with session_scope() as session:
        measurement = import_points(session, points, **kwargs)  # type: ignore[arg-type]
        return measurement.id
