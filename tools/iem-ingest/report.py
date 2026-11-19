"""Reproducible, file-based pilot summary and ranking regression check."""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem"


def jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def csvrows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


before = json.loads((DATA / "reports/ranking-before.json").read_text(encoding="utf-8"))
after = json.loads((DATA / "reports/ranking-after.json").read_text(encoding="utf-8"))
rank = {name: {"before": len(items), "after": len(after.get(name, [])),
               "identical": items == after.get(name)} for name, items in before.items()}
staging = csvrows(DATA / "processed/pilot-staging.csv")
coverage = csvrows(DATA / "market/coverage.csv")
probe = json.loads((DATA / "reports/image-probe.json").read_text(encoding="utf-8"))
images = jsonl(DATA / "processed/library-pilot-approved.jsonl")
summary = {
    "generated_at": datetime.now(UTC).isoformat(),
    "staging": dict(Counter(row["measurement_status"] for row in staging)),
    "market_rows": len(coverage),
    "market_missing": sum(row["in_db_already"] == "no" for row in coverage),
    "market_missing_with_index_lead": sum(row["in_db_already"] == "no" and bool(row["measurement_availability"])
                                           for row in coverage),
    "normalized_measurements": len(jsonl(DATA / "processed/measurements-pilot.jsonl")),
    "image_products_probed": len({row["handle"] for row in probe if "handle" in row}),
    "image_candidates_valid": sum("file" in row for row in probe),
    "image_approved_rows": len(images),
    "image_primary_models": sorted({row["slug"] for row in images if row["role"] == "primary"}),
    "ranking": rank,
}
target = DATA / "reports/pilot-summary.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(summary, handle, indent=2)
if not all(item["identical"] for item in rank.values()):
    raise SystemExit("ranking regression detected; see pilot-summary.json")
print(json.dumps(summary, indent=2))
