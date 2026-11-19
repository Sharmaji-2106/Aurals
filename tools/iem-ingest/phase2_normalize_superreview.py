"""Normalize manually matched Super Review 711 curves from pinned AutoEq CSVs."""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

from intake import cached_get

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "7ae0f56d53074872b028649617a22bbb4232feb7"
BASE = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{COMMIT}"
EXPECTED = [
    ("7Hz", "x Crinacle Zero: 2", "7Hz x Crinacle Zero 2"),
    ("KZ", "ZS10 Pro", "KZ ZS10 Pro"),
    ("Moondrop", "Space Travel 2", "Moondrop Space Travel 2"),
    ("Nightjar", "Singularity", "Nightjar Singularity"),
    ("Thieaudio", "Oracle", "ThieAudio Oracle"),
    ("Truthear", "Pure", "Truthear Pure"),
    ("Moondrop", "x Crinacle DUSK", "Moondrop x Crinacle DUSK"),
    ("Hisenior", "Mega5EST", "Hisenior Mega 5 EST"),
    ("CrinEar", "Daybreak", "CrinEar Daybreak"),
    ("64 Audio", "Tia Trio", "64 Audio Tia Trio"),
    ("Kiwi Ears", "KE4", "Kiwi Ears KE4"),
    ("Dunu", "x GizAudio DaVinci", "DUNU x Gizaudio DaVinci"),
    ("Dunu", "Mirai", "DUNU Mirai"),
    ("Kiwi Ears", "Quintet", "Kiwi Ears Quintet"),
    ("Truthear", "Hola", "Truthear Hola"),
    ("Oriolus", "Traillii", "Oriolus Traillii"),
    ("AFUL", "Explorer", "AFUL Explorer"),
    ("Tangzu", "Zetian Wu", "TANGZU Zetian Wu"),
    ("FiiO", "FD7", "FiiO FD7"),
]

index_url = f"{BASE}/measurements/Super%20Review/name_index.tsv"
index = list(csv.DictReader(io.StringIO(cached_get(index_url).decode("utf-8-sig")), delimiter="\t"))
rows = []
for brand, model, source_name in EXPECTED:
    matches = [r for r in index if r["name"] == source_name and r["form"] == "in-ear" and r["rig"] == "711"]
    if not matches:
        print("unresolved:", brand, model, source_name)
        continue
    source_path = f"measurements/Super Review/data/in-ear/{source_name}.csv"
    raw_url = f"{BASE}/{urllib.parse.quote(source_path)}"
    data = cached_get(raw_url).decode("utf-8-sig")
    points = []
    for item in csv.reader(io.StringIO(data)):
        if len(item) >= 2:
            try:
                points.append([float(item[0]), float(item[1])])
            except ValueError:
                pass
    if len(points) < 20:
        raise ValueError(f"too few numeric points: {source_name}")
    rows.append({"brand": brand, "model": model, "source": "Super Review (via AutoEq)",
                 "source_url": raw_url, "rig": "711", "rig_family": "iec60318-4-clone",
                 "form": "in-ear", "variant": None,
                 "source_ref": f"AutoEq@{COMMIT}:{source_path}",
                 "retrieved_at": datetime.now(UTC).isoformat(),
                 "license": "Super Review measurements redistributed by AutoEq; underlying numerical reuse terms unconfirmed.",
                 "notes": f"Source label: {source_name}. Original graph URL in AutoEq index: {matches[0].get('url')}. "
                          "Measured listening mode/eartip variant is unspecified unless encoded in source label.",
                 "points": points})
    print(source_name, len(points))

target = ROOT / "data/iem/processed/phase2-measurements-superreview-batch1.jsonl"
with target.open("x", encoding="utf-8") as handle:
    for row in rows:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")
print("normalized", len(rows))
