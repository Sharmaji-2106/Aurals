"""Prepare the 25-model pilot, staging unknowns and sourced catalogue facts."""

from __future__ import annotations

import csv
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/iem/processed"
PRODUCTS = json.loads((OUT / "linsoul-products.json").read_text(encoding="utf-8"))
MEASURED = json.loads((ROOT / "data/iem/reports/ranking-before.json").read_text(encoding="utf-8"))["sample"]
EXISTING = {row["slug"] for row in MEASURED}
NEW_MEASURED = [json.loads(line) for line in (OUT / "measurements-pilot.jsonl").read_text(encoding="utf-8").splitlines()]

PILOT = [(row["brand"], row["model"]) for row in NEW_MEASURED] + [
    ("Moondrop", "Variations"), ("Kiwi Ears", "Orchestra Lite"),
    ("Moondrop", "Quarks"), ("7Hz", "Salnotes Zero"),
    ("7Hz", "Timeless"), ("KZ", "ZSN Pro X"), ("Truthear", "Nova"),
    ("7Hz", "x Crinacle Zero: 2"), ("Simgot", "EW300"),
    ("Simgot", "EM6L"), ("Thieaudio", "Monarch MKIII"),
    ("Letshuoer", "Cadenza 12"), ("Hidizs", "MP145"),
    ("CrinEar", "Reference"),
]
assert len(PILOT) == 25

DRIVERS = {
    "kiwi-ears-cadenza": "1DD", "kz-castor": "2DD",
    "dunu-titan-s2": "1DD", "tangzu-wan-er-s-g": "1DD",
    "kiwi-ears-orchestra-lite": "8BA", "7hz-salnotes-zero": "1DD",
    "moondrop-variations": "1DD+2BA+2EST",
}


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def slug(brand: str, model: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (brand + " " + model).lower()).strip("-")


staging, catalogue = [], []
for brand, model in PILOT:
    key = slug(brand, model)
    matches = [p for p in PRODUCTS if norm(p["title"]) == norm(brand + " " + model)]
    product = matches[0] if matches else None
    page = f"https://www.linsoul.com/products/{product['handle']}" if product else ""
    price = product["variants"][0]["price"] if product else ""
    measured = key in EXISTING or any(row["brand"] == brand and row["model"] == model for row in NEW_MEASURED)
    record = {"brand": brand, "model": model, "slug": key,
              "measurement_status": "existing" if key in EXISTING else "clone 711 imported" if measured else "unmeasured/staged",
              "retailer_page_url": page, "retailer_price_usd": price,
              "driver_claim": DRIVERS.get(key, ""), "retrieved_on": date.today().isoformat(),
              "terms_note": "Retailer catalog; claims and photos copyrighted, reuse permission unconfirmed" if product else "unknown"}
    staging.append(record)
    if measured and product:
        catalogue.append({"brand": brand, "model": model, "price": price,
                          "currency": "USD", "price_source": "Linsoul (first listed variant)",
                          "price_source_url": page, "price_observed_on": date.today().isoformat(),
                          "driver_config": DRIVERS.get(key, ""), "release_year": "",
                          "availability": "", "specs_source_url": page if key in DRIVERS else "",
                          "specs_retrieved_on": date.today().isoformat() if key in DRIVERS else "",
                          "specs_evidence_type": "retailer_claim" if key in DRIVERS else ""})

for filename, rows in (("pilot-staging.csv", staging), ("catalogue-pilot.csv", catalogue)):
    destination = OUT / filename
    if destination.exists():
        raise FileExistsError(destination)
    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
print(f"{len(staging)} pilot models; {len(catalogue)} sourced catalogue rows")
