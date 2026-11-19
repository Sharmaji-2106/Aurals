"""Prepare sourced Linsoul prices and explicit driver claims for measured IEMs."""

import csv
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
products = json.loads((DATA / "linsoul-products.json").read_text(encoding="utf-8"))
if isinstance(products, dict):
    products = products["products"]
by_handle = {item["handle"]: item for item in products}
identities = {row["slug"]: row for row in json.loads((DATA / "phase2b-catalogue-identities-after-hiend.json").read_text(encoding="utf-8"))}
prior_specs = {(r["brand"], r["model"]) for r in csv.DictReader((DATA / "catalogue-pilot.csv").open(encoding="utf-8")) if r["driver_config"]}
index = json.loads((ROOT / "data/iem-images/index.json").read_text(encoding="utf-8"))
driver_pattern = re.compile(r"(?<!\d)(\d+(?:DD|BA|PL|EST|BC)(?:\s*\+\s*\d+(?:DD|BA|PL|EST|BC))*)(?![A-Z])", re.I)
fields = ["brand", "model", "price", "currency", "price_source", "price_source_url",
          "price_observed_on", "driver_config", "release_year", "availability",
          "specs_source_url", "specs_retrieved_on", "specs_evidence_type"]
rows, skipped = [], []
for entry in index:
    if entry.get("source") != "Linsoul":
        continue
    iem = identities.get(entry["slug"])
    if iem is None:
        continue
    handle = entry["source_url"].split("/products/", 1)[-1]
    product = by_handle.get(handle)
    if product is None or not product.get("variants"):
        skipped.append({"slug": entry["slug"], "reason": "source handle or variant absent from cached Linsoul feed"})
        continue
    first = product["variants"][0]
    try:
        price = float(first["price"])
    except (KeyError, ValueError, TypeError):
        skipped.append({"slug": entry["slug"], "reason": "first variant has no numeric price"})
        continue
    if not 0 < price < 20000:
        skipped.append({"slug": entry["slug"], "reason": "first variant price outside plausible USD range"})
        continue
    title = product["title"]
    match = driver_pattern.search(title)
    driver = re.sub(r"\s+", "", match.group(1)).upper() if match and (iem["brand"], iem["model"]) not in prior_specs else ""
    url = entry["source_url"]
    rows.append({"brand": iem["brand"], "model": iem["model"],
                 "price": f"{price:.2f}", "currency": "USD",
                 "price_source": "Linsoul public product feed (first listed variant)",
                 "price_source_url": url, "price_observed_on": date.today().isoformat(),
                 "driver_config": driver, "release_year": "", "availability": "",
                 "specs_source_url": url if driver else "",
                 "specs_retrieved_on": date.today().isoformat() if driver else "",
                 "specs_evidence_type": "retailer_claim" if driver else ""})
output = DATA / "phase2b-linsoul-catalogue.csv"
with output.open("x", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
(DATA / "phase2b-linsoul-catalogue-skipped.json").write_text(json.dumps(skipped, indent=2), encoding="utf-8")
print({"sourced_prices": len(rows), "explicit_driver_claims": sum(bool(r["driver_config"]) for r in rows), "skipped": len(skipped)})
