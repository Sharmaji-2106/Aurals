"""Refresh checklist DB and image flags from the current local catalogue snapshot."""

import csv
import json
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "data/iem/market/coverage.csv"
SNAPSHOT = ROOT / "data/iem/processed/phase2b-catalogue-identities-after-superreview.json"
BACKUPS = ROOT / "data/iem/backups"


def slug(brand: str, model: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{brand} {model}".lower()).strip("-")


rows = list(csv.DictReader(CSV.open(encoding="utf-8", newline="")))
identities = {r["slug"]: r for r in json.loads(SNAPSHOT.read_text(encoding="utf-8"))}
for row in rows:
    match = identities.get(slug(row["brand"], row["model"]))
    row["in_db_already"] = "yes" if match else "no"
    row["image_status"] = "approved" if match and match["image_path"] else "none"
backup = BACKUPS / f"coverage.before-status-refresh-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.csv"
shutil.copyfile(CSV, backup)
with CSV.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print({"rows": len(rows), "in_db": sum(r["in_db_already"] == "yes" for r in rows),
       "with_image": sum(r["image_status"] == "approved" for r in rows), "backup": str(backup)})
