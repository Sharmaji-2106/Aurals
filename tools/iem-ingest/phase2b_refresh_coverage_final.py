"""Refresh market checklist status from the final image ledger."""

import csv
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
target = ROOT / "data/iem/market/coverage.csv"
ledger = {row["slug"]: row for row in csv.DictReader((ROOT / "data/iem/reports/phase2b-image-status.csv").open(encoding="utf-8", newline=""))}
rows = list(csv.DictReader(target.open(encoding="utf-8", newline="")))
for row in rows:
    slug = re.sub(r"[^a-z0-9]+", "-", (row["brand"] + " " + row["model"]).lower()).strip("-")
    match = ledger.get(slug)
    row["in_db_already"] = "yes" if match else "no"
    row["image_status"] = match["image_status"] if match else "none"
backup = ROOT / "data/iem/backups" / f"coverage.before-final-status-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.csv"
shutil.copyfile(target, backup)
with target.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print({"rows": len(rows), "in_db": sum(row["in_db_already"] == "yes" for row in rows),
       "approved": sum(row["image_status"] == "approved" for row in rows), "backup": str(backup)})
