"""Append evidence-linked historical ranking entries to the market checklist."""

from __future__ import annotations

import csv
import io
import json
import re
import shutil
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from lxml import html

from intake import cached_get
from phase2b_bulk_superreview import identity, slug

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
MARKET = ROOT / "data/iem/market"
BACKUPS = ROOT / "data/iem/backups"
URL = "https://crinacle.com/rankings/iems/pre2023/"
PIN = "7ae0f56d53074872b028649617a22bbb4232feb7"


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def tier(price: float) -> str:
    if price < 50:
        return "$0-50"
    if price < 150:
        return "$50-150"
    if price < 500:
        return "$150-500"
    if price < 1500:
        return "$500-1500"
    return "$1500+"


def main() -> None:
    csv_path = MARKET / "coverage.csv"
    existing = list(csv.DictReader(csv_path.open(encoding="utf-8", newline="")))
    columns = list(existing[0])
    seen = {compact(row["brand"] + row["model"]) for row in existing}
    identities = json.loads((DATA / "phase2b-catalogue-identities-after-superreview.json").read_text(encoding="utf-8"))
    known = {r["slug"]: r for r in identities}
    exact_known = {compact(r["brand"] + r["model"]): r for r in identities}
    super_index = list(csv.DictReader((ROOT / "data/iem/raw/autoeq-sparse-phase2b/measurements/Super Review/name_index.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    crin_index = list(csv.DictReader((ROOT / "data/iem/raw/autoeq-sparse-phase2b/measurements/crinacle/name_index.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    super_names = {compact(r["name"]): r["rig"] for r in super_index if r["form"] == "in-ear" and r["name"]}
    crin_names = {compact(r["name"]): r["rig"] for r in crin_index if r["form"] == "in-ear" and r["name"]}
    page = html.fromstring(cached_get(URL))
    table = page.get_element_by_id("tablepress-4")
    candidates = []
    for tr in table.xpath(".//tr"):
        cells = [re.sub(r"\s+", " ", td.text_content()).strip() for td in tr.xpath("./td")]
        if len(cells) < 4:
            continue
        name, price_text = cells[2], cells[3]
        if not name or "/" in name or len(name) > 90:
            continue  # combined product comparisons are not one model identity
        match = re.fullmatch(r"\$?([\d,]+(?:\.\d{1,2})?)", price_text)
        if not match:
            continue
        price = float(match.group(1).replace(",", ""))
        if price <= 0 or price > 20000:
            continue
        exact = exact_known.get(compact(name))
        if exact:
            brand, model = exact["brand"], exact["model"]
        else:
            brand, model = identity(name, known)
        if not model or compact(brand + model) in seen:
            continue
        key = compact(brand + model)
        evidence = []
        if key in super_names:
            evidence.append(f"Super Review / {super_names[key]} (AutoEq index)")
        if key in crin_names:
            evidence.append(f"crinacle / {crin_names[key]} (AutoEq index; raw unavailable)")
        in_db = known.get(slug(brand, model))
        candidates.append({"priority": "", "brand": brand, "model": model, "variant": "",
                           "price_tier": tier(price), "indicative_price_usd": f"{price:.2f}",
                           "price_source_url": URL,
                           "why_it_matters": "historical reviewer ranking (subjective; pre-2023)",
                           "evidence_url": URL, "in_db_already": "yes" if in_db else "no",
                           "measurement_availability": "; ".join(evidence),
                           "image_status": "approved" if in_db and in_db["image_path"] else "none"})
        seen.add(key)
    # The published ranking is ordered by the reviewer's grade. Draw from all
    # tiers, then fill remaining slots by that order to retain breadth.
    chosen, counts = [], Counter()
    for row in candidates:
        if counts[row["price_tier"]] < 20:
            chosen.append(row)
            counts[row["price_tier"]] += 1
        if len(chosen) >= 180 - len(existing):
            break
    if len(chosen) < 180 - len(existing):
        selected = {id(r) for r in chosen}
        chosen.extend(r for r in candidates if id(r) not in selected)
        chosen = chosen[:180-len(existing)]
    for position, row in enumerate(chosen, len(existing) + 1):
        row["priority"] = str(position)
    backup = BACKUPS / f"coverage.before-phase2b-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.csv"
    shutil.copyfile(csv_path, backup)
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(existing + chosen)
    print({"before": len(existing), "added": len(chosen), "after": len(existing) + len(chosen),
           "new_tiers": dict(Counter(r["price_tier"] for r in chosen)), "backup": str(backup)})


if __name__ == "__main__":
    main()
