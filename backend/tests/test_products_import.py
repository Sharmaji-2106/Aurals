"""Unmeasured products join the catalogue as themselves, with their listing and photo."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from sqlalchemy import select

from auralis.db import session_scope
from auralis.iem.models import Iem, IemPriceObservation
from auralis.iem.products import import_products


def _write(tmp_path: Path, rows: list[dict[str, object]]) -> Path:
    path = tmp_path / "products.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    return path


ROW = {
    "brand": "Testco",
    "model": "Unmeasured One",
    "price": "1899",
    "currency": "INR",
    "price_region": "IN",
    "price_source": "Headphone Zone",
    "price_source_url": "https://www.headphonezone.in/products/testco-one",
    "price_observed_on": "2026-11-15",
}


@pytest.mark.usefixtures("db")
def test_a_new_product_is_listed_with_its_rupee_price(tmp_path: Path) -> None:
    path = _write(tmp_path, [ROW])
    with session_scope() as s:
        report = import_products(s, path)
    assert (report.created, report.prices, report.errors) == (1, 1, [])
    with session_scope() as s:
        iem = s.scalar(select(Iem).where(Iem.slug == "testco-unmeasured-one"))
        assert iem is not None
        price = s.scalar(select(IemPriceObservation).where(IemPriceObservation.iem_id == iem.id))
        assert price is not None
        assert (price.currency, price.region, str(price.amount)) == ("INR", "IN", "1899.00")
    # Importing again adds nothing.
    with session_scope() as s:
        again = import_products(s, path)
    assert (again.created, again.existing, again.prices) == (0, 1, 0)


@pytest.mark.usefixtures("db")
def test_bad_rows_are_refused_not_guessed(tmp_path: Path) -> None:
    rows = [
        {**ROW, "model": "No Https", "price_source_url": "http://example.com"},
        {**ROW, "model": "Outside", "image_file": "../../etc/passwd"},
        {"brand": "", "model": "Nameless"},
    ]
    with session_scope() as s:
        report = import_products(s, _write(tmp_path, rows))
    assert len(report.errors) == 3
    with session_scope() as s:
        assert s.scalar(select(Iem).where(Iem.brand == "Testco")) is None
