"""Products the catalogue lists before (or without) a measurement.

Most of the catalogue arrives with a frequency-response measurement, and only
measured products can be matched to a listener. But a listener shopping in India
should still find an earphone a shop sells even when nobody has published a
measurement of it yet. Such a product is stored as itself — its name, the shop's
rupee listing and photograph, each with its source — and never given a curve, a
score or a guess. The store says it has not been measured.

JSONL, one product per line::

    {"brand": "KZ", "model": "Duonic",
     "price": "1899", "currency": "INR", "price_region": "IN",
     "price_source": "Headphone Zone",
     "price_source_url": "https://www.headphonezone.in/products/kz-duonic",
     "price_observed_on": "2026-11-15",
     "image_file": "originals/kz-duonic/abc.jpg",          # optional, inside data/iem-images
     "image_source": "Headphone Zone", "image_source_url": "https://…",
     "image_credit": "Headphone Zone product photography"}

An existing product (same slug) is never renamed or overwritten: its listing is added
if new, and its photograph only if it has none.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.iem.images import DATA_DIR
from auralis.iem.importer import slugify
from auralis.iem.models import Iem, IemPriceObservation


@dataclass
class ProductReport:
    created: int = 0
    existing: int = 0
    prices: int = 0
    photos: int = 0
    errors: list[str] = field(default_factory=list)


def _price(session: Session, iem: Iem, row: dict[str, Any]) -> bool:
    if not row.get("price"):
        return False
    for key in ("currency", "price_source", "price_source_url", "price_observed_on"):
        if not row.get(key):
            raise ValueError(f"a price needs {key}")
    if not str(row["price_source_url"]).startswith("https://"):
        raise ValueError("price_source_url must be https")
    try:
        amount = Decimal(str(row["price"]))
    except InvalidOperation as exc:
        raise ValueError(f"price is not a number: {row['price']!r}") from exc
    observed = date.fromisoformat(str(row["price_observed_on"]))
    observed_at = datetime(observed.year, observed.month, observed.day, tzinfo=UTC)
    currency = str(row["currency"]).upper()[:3]
    duplicate = session.scalar(
        select(IemPriceObservation.id).where(
            IemPriceObservation.iem_id == iem.id,
            IemPriceObservation.amount == amount,
            IemPriceObservation.currency == currency,
            IemPriceObservation.source_url == row["price_source_url"],
            IemPriceObservation.observed_at == observed_at,
        )
    )
    if duplicate is not None:
        return False
    session.add(
        IemPriceObservation(
            iem_id=iem.id,
            amount=amount,
            currency=currency,
            region=(str(row.get("price_region") or "")).upper()[:2] or None,
            source=str(row["price_source"])[:200],
            source_url=row["price_source_url"],
            observed_at=observed_at,
        )
    )
    return True


def _photo(iem: Iem, row: dict[str, Any]) -> bool:
    file = row.get("image_file")
    if not file or iem.image_path:
        return False
    path = (DATA_DIR / str(file)).resolve()
    if DATA_DIR.resolve() not in path.parents or not path.is_file():
        raise ValueError(f"image_file {file} is not inside data/iem-images")
    url = row.get("image_source_url")
    if url and not str(url).startswith("https://"):
        raise ValueError("image_source_url must be https")
    iem.image_path = str(file).replace("\\", "/")
    iem.image_source = str(row.get("image_source") or row.get("price_source") or "unknown")[:200]
    iem.image_source_url = url
    iem.image_credit = str(row.get("image_credit") or iem.image_source)
    iem.image_retrieved_on = date.fromisoformat(
        str(row.get("image_retrieved_on") or row.get("price_observed_on") or date.today())
    )
    return True


def import_products(session: Session, path: Path, *, dry_run: bool = False) -> ProductReport:
    report = ProductReport()
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row: dict[str, Any] = json.loads(line)
            brand = str(row.get("brand") or "").strip()
            model = str(row.get("model") or "").strip()
            if not brand or not model:
                raise ValueError("brand and model are required")
            slug = str(row.get("slug") or slugify(brand, model))
            with session.begin_nested():
                iem = session.scalar(select(Iem).where(Iem.slug == slug))
                if iem is None:
                    iem = Iem(brand=brand[:100], model=model[:150], slug=slug[:260])
                    session.add(iem)
                    session.flush()
                    report.created += 1
                else:
                    report.existing += 1
                report.prices += int(_price(session, iem, row))
                report.photos += int(_photo(iem, row))
        except (ValueError, json.JSONDecodeError) as exc:
            report.errors.append(f"line {n}: {exc}")
    if dry_run:
        session.rollback()
    else:
        session.commit()
    return report
