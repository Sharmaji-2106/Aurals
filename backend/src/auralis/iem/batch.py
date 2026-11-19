"""Import normalized, provenance-carrying IEM measurements without changing old rankings."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.acoustics.fr import validate_points
from auralis.core.errors import Conflict
from auralis.iem.importer import checksum, import_points, slugify
from auralis.iem.models import FrMeasurement, Iem

VERIFIED_IEC_RIGS = frozenset(
    {
        "GRAS 43AG",
        "GRAS 43AC",
        "GRAS 43ACB",
        "GRAS 45BC",
        "GRAS 45BC-10",
        "GRAS RA0045",
        "GRAS RA0402",
    }
)


@dataclass
class BatchReport:
    added: int = 0
    duplicate: int = 0
    blocked_existing: int = 0
    would_add: int = 0
    errors: list[str] = field(default_factory=list)


def import_measurements(session: Session, path: Path, *, dry_run: bool = False) -> BatchReport:
    report = BatchReport()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row: dict[str, Any] = json.loads(line)
            required = (
                "brand",
                "model",
                "source",
                "source_url",
                "rig",
                "rig_family",
                "source_ref",
                "retrieved_at",
                "license",
                "points",
            )
            if any(not row.get(key) for key in required):
                raise ValueError("missing required provenance or points")
            if not str(row["source_url"]).startswith("https://"):
                raise ValueError("source_url must be HTTPS")
            if row["rig_family"] == "iec60318-4" and row["rig"] not in VERIFIED_IEC_RIGS:
                raise ValueError("IEC family requires a verified GRAS rig")
            validate_points(row["points"])
            brand, model = str(row["brand"]).strip(), str(row["model"]).strip()
            iem = session.scalar(select(Iem).where(Iem.slug == slugify(brand, model)))
            if iem is not None and (iem.brand != brand or iem.model != model):
                raise ValueError("slug matches a different identity; review manually")
            digest = checksum(row["points"])
            existing = (
                session.scalars(select(FrMeasurement).where(FrMeasurement.iem_id == iem.id)).all()
                if iem
                else []
            )
            if any(measurement.checksum == digest for measurement in existing):
                report.duplicate += 1
                continue
            # A pre-existing IEM's selected measurement must remain the same.
            if (
                iem
                and row["rig_family"] == "iec60318-4"
                and any(measurement.rig_family == "iec60318-4" for measurement in existing)
            ):
                report.blocked_existing += 1
                continue
            if dry_run:
                report.would_add += 1
                continue
            with session.begin_nested():
                import_points(
                    session,
                    row["points"],
                    brand=brand,
                    model=model,
                    source=row["source"],
                    source_url=row["source_url"],
                    rig=row["rig"],
                    rig_family=row["rig_family"],
                    form=row.get("form", "in-ear"),
                    variant=row.get("variant"),
                    source_ref=row["source_ref"],
                    retrieved_at=datetime.fromisoformat(row["retrieved_at"]),
                    license=row["license"],
                    notes=row.get("notes"),
                )
            report.added += 1
        except (ValueError, KeyError, TypeError, Conflict) as exc:
            report.errors.append(f"line {line_no}: {exc}")
    return report
