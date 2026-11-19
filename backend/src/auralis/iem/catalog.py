"""Import catalogue facts (prices, driver configuration, release, availability) from CSV.

Every fact needs a source. A price without a source URL and an observation date is
refused, not stored; a driver configuration without a specs source is refused too. Rows
must refer to IEMs that already have a measurement, so the catalogue never grows
entries that can't be matched.

Columns (header required; empty cells mean unknown)::

    brand, model, price, currency, price_source, price_source_url, price_observed_on,
    driver_config, release_year, availability, specs_source_url, specs_retrieved_on,
    specs_evidence_type

Optional: ``price_region`` (ISO country, e.g. ``IN``) for where the listing sells.

``driver_config`` is written like ``1DD+4BA`` (dynamic, balanced armature, planar
``PL``, electrostatic ``EST``, bone conduction ``BC``).
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.iem.models import Iem, IemPriceObservation

DRIVER_KINDS: Final = {
    "DD": "dynamic",
    "BA": "balanced_armature",
    "PL": "planar",
    "EST": "electrostatic",
    "BC": "bone_conduction",
}


class CatalogError(ValueError):
    pass


def parse_drivers(text: str) -> dict[str, Any]:
    config: dict[str, Any] = {}
    for part in text.replace(" ", "").split("+"):
        match = re.fullmatch(r"(\d+)(DD|BA|PL|EST|BC)", part, flags=re.IGNORECASE)
        if not match:
            raise CatalogError(f"unrecognised driver configuration: {text!r}")
        kind = DRIVER_KINDS[match.group(2).upper()]
        config[kind] = config.get(kind, 0) + int(match.group(1))
    return config


def _date(text: str, column: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise CatalogError(f"{column} must be YYYY-MM-DD, got {text!r}") from exc


@dataclass
class CatalogReport:
    updated: int = 0
    prices: int = 0
    errors: list[str] = field(default_factory=list)


def import_catalog(session: Session, path: Path, *, dry_run: bool = False) -> CatalogReport:
    report = CatalogReport()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for line, row in enumerate(csv.DictReader(handle), start=2):
            previous_updated, previous_prices = report.updated, report.prices
            try:
                with session.begin_nested() as savepoint:
                    _import_row(session, {k: (v or "").strip() for k, v in row.items()}, report)
                    if dry_run:
                        savepoint.rollback()
            except CatalogError as exc:
                report.updated, report.prices = previous_updated, previous_prices
                report.errors.append(f"line {line}: {exc}")
    session.flush()
    return report


def _import_row(session: Session, row: dict[str, str], report: CatalogReport) -> None:
    iem = session.scalar(select(Iem).where(Iem.brand == row["brand"], Iem.model == row["model"]))
    if iem is None:
        raise CatalogError(f"no measured IEM called {row['brand']} {row['model']}")

    if row.get("price"):
        missing = [
            c
            for c in ("currency", "price_source", "price_source_url", "price_observed_on")
            if not row.get(c)
        ]
        if missing:
            raise CatalogError(f"a price needs {', '.join(missing)}")
        try:
            amount = Decimal(row["price"])
        except InvalidOperation as exc:
            raise CatalogError(f"price is not a number: {row['price']!r}") from exc
        observed = _date(row["price_observed_on"], "price_observed_on")
        observed_at = datetime(observed.year, observed.month, observed.day, tzinfo=UTC)
        duplicate = session.scalar(
            select(IemPriceObservation.id).where(
                IemPriceObservation.iem_id == iem.id,
                IemPriceObservation.amount == amount,
                IemPriceObservation.currency == row["currency"].upper()[:3],
                IemPriceObservation.source_url == row["price_source_url"],
                IemPriceObservation.observed_at == observed_at,
            )
        )
        if duplicate is None:
            session.add(
                IemPriceObservation(
                    iem_id=iem.id,
                    amount=amount,
                    currency=row["currency"].upper()[:3],
                    source=row["price_source"],
                    source_url=row["price_source_url"],
                    observed_at=observed_at,
                    region=(row.get("price_region") or "").upper()[:2] or None,
                )
            )
            report.prices += 1

    specs = {k: row.get(k) for k in ("driver_config", "release_year", "availability")}
    if any(specs.values()):
        if not row.get("specs_source_url") or not row.get("specs_retrieved_on"):
            raise CatalogError("specs need specs_source_url and specs_retrieved_on")
        evidence_type = row.get("specs_evidence_type") or "unclassified_claim"
        if evidence_type not in (
            "manufacturer_claim",
            "retailer_claim",
            "verified_spec",
            "unclassified_claim",
        ):
            raise CatalogError("specs_evidence_type must identify the claim category")
        parsed_drivers = parse_drivers(specs["driver_config"]) if specs["driver_config"] else None
        if iem.specs_source_url and (
            iem.specs_source_url != row["specs_source_url"]
            or (parsed_drivers and iem.driver_config != parsed_drivers)
        ):
            raise CatalogError("existing sourced specs differ; manual review required")
        retrieved_on = _date(row["specs_retrieved_on"], "specs_retrieved_on")
        unchanged = (
            (not parsed_drivers or iem.driver_config == parsed_drivers)
            and (not specs["release_year"] or iem.release_year == int(specs["release_year"]))
            and (not specs["availability"] or iem.availability == specs["availability"])
            and iem.specs_source_url == row["specs_source_url"]
            and iem.specs_retrieved_on == retrieved_on
            and iem.specs_evidence_type == evidence_type
        )
        if parsed_drivers:
            iem.driver_config = parsed_drivers
        if specs["release_year"]:
            iem.release_year = int(specs["release_year"])
        if specs["availability"]:
            if specs["availability"] not in ("available", "discontinued"):
                raise CatalogError("availability must be 'available' or 'discontinued'")
            iem.availability = specs["availability"]
        iem.specs_source_url = row["specs_source_url"]
        iem.specs_retrieved_on = retrieved_on
        iem.specs_evidence_type = evidence_type
        if not unchanged:
            report.updated += 1
