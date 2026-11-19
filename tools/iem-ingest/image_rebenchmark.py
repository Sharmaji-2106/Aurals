"""Recompute quality heuristics from cached original bytes without any requests."""

from __future__ import annotations

import json
from pathlib import Path

from intake import image_metrics

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / "data/iem/reports/image-probe.json"
target = ROOT / "data/iem/reports/image-probe-v2.json"
records = json.loads(source.read_text(encoding="utf-8"))
for row in records:
    if "file" in row:
        actual = image_metrics((ROOT / row["file"]).read_bytes())
        if actual["sha256"] != row["sha256"]:
            raise ValueError(f"candidate bytes changed: {row['file']}")
        row.update(actual)
with target.open("x", encoding="utf-8") as handle:
    json.dump(records, handle, indent=2)
print(f"rebenchmarked {sum('file' in row for row in records)} byte-identical originals")
