"""Compare full ranked snapshots while allowing genuinely new ranked IEMs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "data/iem/reports"
before_name, after_name = sys.argv[1:3]
before = json.loads((REPORTS / f"ranking-{before_name}.json").read_text(encoding="utf-8"))
after = json.loads((REPORTS / f"ranking-{after_name}.json").read_text(encoding="utf-8"))
if before.keys() != after.keys():
    raise ValueError("different sound profile IDs; compare identical listeners")
results = {}
for profile, old in before.items():
    new = after[profile]
    old_slugs = [row["slug"] for row in old]
    new_by_slug = {row["slug"]: row for row in new}
    missing = [slug for slug in old_slugs if slug not in new_by_slug]
    changed = [row["slug"] for row in old if new_by_slug.get(row["slug"]) != row]
    old_order_after = [row["slug"] for row in new if row["slug"] in set(old_slugs)]
    order_changed = old_order_after != old_slugs
    results[profile] = {"before_count": len(old), "after_count": len(new),
                        "new_ranked": [row["slug"] for row in new if row["slug"] not in set(old_slugs)],
                        "missing": missing, "changed_score_or_source": changed,
                        "old_relative_order_changed": order_changed,
                        "passed": not missing and not changed and not order_changed}
target = REPORTS / f"ranking-compare-{before_name}-to-{after_name}.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(results, handle, indent=2)
print({key: {"before": value["before_count"], "after": value["after_count"],
             "changed": len(value["changed_score_or_source"]), "passed": value["passed"]}
       for key, value in results.items()})
if not all(value["passed"] for value in results.values()):
    raise SystemExit("ranking invariance failed; inspect comparison report")
