"""Build an evidence-linked market checklist from public lists and cached data."""

from __future__ import annotations

import csv
import io
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from intake import cached_get

ROOT = Path(__file__).resolve().parents[2]
MARKET = ROOT / "data/iem/market"
PRODUCTS = json.loads((ROOT / "data/iem/processed/linsoul-products.json").read_text(encoding="utf-8"))
EXISTING = {x["slug"] for x in json.loads((ROOT / "data/iem/reports/ranking-before.json").read_text(encoding="utf-8"))["sample"]}
EXISTING.update(re.sub(r"[^a-z0-9]+", "-", (x["brand"] + " " + x["model"]).lower()).strip("-")
                for x in (json.loads(line) for line in (ROOT / "data/iem/processed/measurements-pilot.jsonl").read_text(encoding="utf-8").splitlines()))
IMAGES = {x["handle"] for x in json.loads((ROOT / "data/iem/reports/image-probe.json").read_text(encoding="utf-8")) if "file" in x}
APPROVED = {x["slug"] for x in json.loads((ROOT / "data/iem-images/index.json").read_text(encoding="utf-8"))}
COMMIT = "7ae0f56d53074872b028649617a22bbb4232feb7"
INDEX_URL = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{COMMIT}/measurements/Super%20Review/name_index.tsv"
INDEX = list(csv.DictReader(io.StringIO(cached_get(INDEX_URL).decode("utf-8-sig")), delimiter="\t"))
OTHER_INDEX = {}
for source in ("crinacle", "Rtings"):
    url = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{COMMIT}/measurements/{source}/name_index.tsv"
    OTHER_INDEX[source] = list(csv.DictReader(io.StringIO(cached_get(url).decode("utf-8-sig")), delimiter="\t"))

LINSOUL = "https://www.linsoul.com/collections/best-sellers"
HPS = "https://headphones.com/pages/hps-iem-ranking"
CRIN = "https://crinacle.com/rankings/iems/"

# Names transcribed from the public lists, not inferred from product filenames.
# The list type is subjective unless it is the retailer best-seller list.
SEED = [
    ("7Hz", "x Crinacle Zero: 2", LINSOUL), ("7Hz", "Salnotes Zero", LINSOUL),
    ("Simgot", "EW300", LINSOUL), ("Tangzu", "Wan'er S.G", LINSOUL),
    ("Kiwi Ears", "Cadenza", LINSOUL), ("Simgot", "EM6L", LINSOUL),
    ("KZ", "ZS10 Pro", LINSOUL), ("XENNS", "Mangird Tea PRO", LINSOUL),
    ("KZ", "Castor", "https://www.linsoul.com/collections/best-sellers?page=5"),
    ("CrinEar", "Reference", HPS), ("Prisma", "Lumen", HPS),
    ("Moondrop", "Space Travel 2", HPS), ("Letshuoer", "Cadenza 12", HPS),
    ("Nightjar", "Singularity", HPS), ("Softears", "Volume S", HPS),
    ("Subtonic", "Storm", HPS), ("64 Audio", "U6t", HPS),
    ("Thieaudio", "Oracle", HPS), ("Kinera", "URD", HPS),
    ("Truthear", "Pure", HPS), ("Apple", "AirPods Pro 2", HPS),
    ("Prisma", "Lux", HPS), ("Moondrop", "x Crinacle DUSK", HPS),
    ("Hisenior", "Mega5EST", HPS), ("Final Audio", "E500", HPS),
    ("Sony", "IER-M7", HPS), ("Vision Ears", "Phönix", HPS),
    ("Ziigaat", "Odyssey", HPS), ("CrinEar", "Daybreak", HPS),
    ("Softears", "RSV mk2", HPS), ("64 Audio", "Tia Trio", HPS),
    ("Empire Ears", "Odin", HPS), ("Hisenior", "Mega7", HPS),
    ("64 Audio", "U12t", HPS), ("Kiwi Ears", "KE4", HPS),
    ("Dunu", "x GizAudio DaVinci", HPS), ("Symphonium", "Crimson", HPS),
    ("Symphonium", "Helios", HPS), ("64 Audio", "U4s", HPS),
    ("Dunu", "Mirai", HPS), ("Kiwi Ears", "Quintet", HPS),
    ("Truthear", "Hola", HPS), ("Truthear", "Gate", HPS),
    ("Truthear", "Hexa", HPS), ("Thieaudio", "Hype 4", HPS),
    ("Thieaudio", "Monarch Mk2", HPS), ("Moondrop", "Kadenz", HPS),
    ("Dunu", "Titan S2", HPS), ("Kiwi Ears", "Septet", HPS),
    ("Oriolus", "Traillii", HPS), ("Sennheiser", "IE 600", HPS),
    ("Truthear", "Nova", HPS), ("Kiwi Ears", "Orchestra Lite", HPS),
    ("Letshuoer", "S08", HPS), ("Moondrop", "Variations", HPS),
    ("AFUL", "Explorer", HPS), ("Moondrop", "Blessing 3", HPS),
    ("Etymotic", "ER4XR", CRIN), ("Shure", "KSE1200", CRIN),
    ("Shure", "SE846", CRIN), ("Tangzu", "Zetian Wu", CRIN),
    ("Tin HiFi", "T2 Plus", CRIN), ("Unique Melody", "Mini MEST", CRIN),
    ("Elysian", "Poseidon", CRIN), ("Campfire Audio", "Andromeda", CRIN),
    ("Westone", "W10", CRIN), ("Final Audio", "A8000", CRIN),
    ("7Hz", "Timeless", CRIN), ("Sony", "IER-Z1R", CRIN),
    ("Sennheiser", "IE 900", CRIN), ("Moondrop", "Chu", CRIN),
    ("Truthear", "x Crinacle Zero RED", CRIN),
    ("AFUL", "Performer 5", "https://headphones.com/blogs/reviews/aful-performer-5-review"),
    ("Elysian", "Pilgrim", "https://headphones.com/blogs/reviews/elysian-acoustics-pilgrim-review-a-step-along-the-journey"),
    ("Unique Melody", "MEST Mk2", "https://crinacle.com/rankings/iems/pre2023/"),
    ("Softears", "RSV", "https://headfonics.com/softears-rsv-review/"),
    ("CCA", "CRA", "https://crinacle.com/rankings/iems/pre2023/"),
    ("FiiO", "FH9", CRIN), ("FiiO", "FD7", CRIN),
    ("Dunu", "SA6", CRIN), ("Samsung", "Galaxy Buds Pro", CRIN),
    ("Shure", "SE215", HPS), ("Etymotic", "ER2XR", HPS),
    ("Sennheiser", "IE 200", HPS), ("Grell", "TWS1x", HPS),
    ("Hidizs", "MP145", "https://www.linsoul.com/products/hidizs-mp145"),
]

PUBLISHED_PRICES = {
    "Etymotic ER4XR": (350, CRIN), "Shure KSE1200": (2000, CRIN),
    "Shure SE846": (1000, CRIN), "Tangzu Zetian Wu": (150, CRIN),
    "Tin HiFi T2 Plus": (60, CRIN), "Unique Melody Mini MEST": (600, CRIN),
    "Elysian Poseidon": (1940, CRIN), "Moondrop Chu": (20, CRIN),
    "Moondrop Variations": (520, CRIN),
    "Unique Melody MEST Mk2": (1500, "https://crinacle.com/rankings/iems/pre2023/"),
    "CCA CRA": (14, "https://crinacle.com/rankings/iems/pre2023/"),
    "FiiO FH9": (600, CRIN), "FiiO FD7": (600, CRIN),
    "Dunu SA6": (550, CRIN), "Samsung Galaxy Buds Pro": (200, CRIN),
}


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def slug(brand: str, model: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (brand + " " + model).lower()).strip("-")


def tier(price: float | None) -> str:
    if price is None:
        return "unknown"
    if price < 50:
        return "$0-50"
    if price < 150:
        return "$50-150"
    if price < 500:
        return "$150-500"
    if price < 1500:
        return "$500-1500"
    return "$1500+"


rows = []
for priority, (brand, model, evidence_url) in enumerate(SEED, 1):
    exact = [p for p in PRODUCTS if norm(p["title"]) == norm(brand + " " + model)]
    product = exact[0] if exact else None
    published = PUBLISHED_PRICES.get(brand + " " + model)
    price = float(product["variants"][0]["price"]) if product else float(published[0]) if published else None
    lookup = norm(brand + " " + model)
    matches = sorted({r["rig"] or "unknown" for r in INDEX if norm(r["name"]) == lookup})
    extra = [f"{source} / {', '.join(sorted({r['rig'] or 'unknown' for r in index if norm(r['name']) == lookup}))}"
             for source, index in OTHER_INDEX.items() if any(norm(r["name"]) == lookup for r in index)]
    database_slug = slug(brand, model)
    in_db = database_slug in EXISTING
    # Existing spelling aliases are reviewed manually in coverage.md.
    image_status = "approved" if database_slug in APPROVED else (
        "candidate, needs approval" if product and product["handle"] in IMAGES else "none")
    rows.append({"priority": priority, "brand": brand, "model": model, "variant": "",
        "price_tier": tier(price), "indicative_price_usd": f"{price:.2f}" if price is not None else "",
        "price_source_url": (f"https://www.linsoul.com/products/{product['handle']}" if product
                             else published[1] if published else ""),
        "why_it_matters": ("retailer best-seller listing" if "linsoul.com/collections" in evidence_url
                            else "reviewer ranking (subjective)"),
        "evidence_url": evidence_url, "in_db_already": "yes" if in_db else "no",
        "measurement_availability": "; ".join(filter(None, [
            "oratory1990 / GRAS IEC 60318-4" if database_slug in {x["slug"] for x in json.loads((ROOT / "data/iem/reports/ranking-before.json").read_text(encoding="utf-8"))["sample"]} else "",
            "Super Review / " + ", ".join(matches) if matches else "",
            *extra,
        ])),
        "image_status": image_status})

MARKET.mkdir(parents=True, exist_ok=True)
csv_path = MARKET / "coverage.csv"
if csv_path.exists():
    backup_dir = ROOT / "data/iem/backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"coverage.before-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    shutil.copyfile(csv_path, backup)
with csv_path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print(f"{len(rows)} rows; {sum(r['in_db_already']=='no' for r in rows)} missing")
