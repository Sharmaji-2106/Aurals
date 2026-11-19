"""Integration checks for additive, rank-safe batch imports."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, select

from auralis.db import session_scope
from auralis.iem.batch import import_measurements
from auralis.iem.catalog import import_catalog
from auralis.iem.importer import import_points
from auralis.iem.models import FrMeasurement, Iem, IemAcousticProfile, IemPriceObservation
from tests.test_fr import synthetic_curve


def _row(points: list[list[float]], **changes: object) -> dict[str, object]:
    row: dict[str, object] = {
        "brand": "Test",
        "model": "Measured IEM",
        "source": "Test source",
        "source_url": "https://example.org/real-measurement",
        "rig": "711",
        "rig_family": "iec60318-4-clone",
        "source_ref": "test:1",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "license": "test only",
        "points": points,
    }
    row.update(changes)
    return row


def _manifest(tmp_path: Path, row: dict[str, object]) -> Path:
    path = tmp_path / "measurements.jsonl"
    path.write_text(json.dumps(row) + "\n", encoding="utf-8")
    return path


def test_clone_import_is_idempotent_and_uses_existing_processor(db: None, tmp_path: Path) -> None:
    path = _manifest(tmp_path, _row(synthetic_curve()))
    with session_scope() as session:
        assert import_measurements(session, path, dry_run=True).would_add == 1
        assert session.scalar(select(func.count()).select_from(Iem)) == 0
        assert import_measurements(session, path).added == 1
        assert import_measurements(session, path).duplicate == 1
        assert session.scalar(select(func.count()).select_from(FrMeasurement)) == 1
        profiles = session.scalars(select(IemAcousticProfile)).all()
        assert len(profiles) == 1
        assert profiles[0].processor_version == "fr/2"
        assert profiles[0].target_name is None  # no compatible target for this clone rig


def test_existing_iec_measurement_is_protected(db: None, tmp_path: Path) -> None:
    with session_scope() as session:
        import_points(
            session,
            synthetic_curve(),
            brand="Test",
            model="Measured IEM",
            source="Original",
            source_url="https://example.org/original",
            rig="GRAS 43AC",
            rig_family="iec60318-4",
        )
        candidate = _row(synthetic_curve(2), rig="GRAS 45BC", rig_family="iec60318-4")
        assert import_measurements(session, _manifest(tmp_path, candidate)).blocked_existing == 1
        assert session.scalar(select(func.count()).select_from(FrMeasurement)) == 1


def test_unknown_gras_rig_cannot_claim_iec_family(db: None, tmp_path: Path) -> None:
    candidate = _row(synthetic_curve(), rig="GRAS unknown", rig_family="iec60318-4")
    with session_scope() as session:
        report = import_measurements(session, _manifest(tmp_path, candidate))
        assert report.added == 0
        assert "verified GRAS rig" in report.errors[0]


def test_catalog_dry_run_and_repeat_are_idempotent(db: None, tmp_path: Path) -> None:
    with session_scope() as session:
        import_points(
            session,
            synthetic_curve(),
            brand="Test",
            model="Measured IEM",
            source="Original",
            source_url="https://example.org/original",
            rig="GRAS 43AC",
            rig_family="iec60318-4",
        )
        path = tmp_path / "catalog.csv"
        path.write_text(
            "brand,model,price,currency,price_source,price_source_url,price_observed_on,"
            "driver_config,specs_source_url,specs_retrieved_on,specs_evidence_type\n"
            "Test,Measured IEM,20,USD,Test retailer,https://example.org/product,2026-11-12,"
            "1DD,https://example.org/product,2026-11-12,retailer_claim\n",
            encoding="utf-8",
        )
        planned = import_catalog(session, path, dry_run=True)
        assert (planned.updated, planned.prices, planned.errors) == (1, 1, [])
        assert session.scalar(select(func.count()).select_from(IemPriceObservation)) == 0
        assert session.scalar(select(Iem.driver_config)) is None
        actual = import_catalog(session, path)
        repeated = import_catalog(session, path)
        assert (actual.updated, actual.prices) == (1, 1)
        assert (repeated.updated, repeated.prices) == (0, 0)
