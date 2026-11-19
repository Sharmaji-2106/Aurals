"""Publish only the visually accepted Variations matte as a traceable derivative."""

from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path

from intake import image_metrics

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "data/iem-images"
PROCESSED = ROOT / "data/iem/processed"
BACKUPS = ROOT / "data/iem/backups"
source = ROOT / "data/iem/reports/variations-cutout-trial/nova-cutout.png"
destination = LIBRARY / "moondrop-variations-cutout.png"
if destination.exists():
    raise FileExistsError(destination)
shutil.copyfile(source, destination)
rows = [json.loads(line) for line in (PROCESSED / "library-pilot-final.jsonl").read_text(encoding="utf-8").splitlines()]
original = next(row for row in rows if row["slug"] == "moondrop-variations" and row["role"] == "primary")
original["role"] = "original"
derivative = {key: original[key] for key in (
    "slug", "source_name", "page_url", "image_url", "credit", "retrieved_on", "licence_note",
    "verification_status", "verification_method", "verification_note", "quality_score"
)}
derivative.update({"file_path": destination.name, "role": "primary",
                   "derived_from": original["file_path"],
                   "processing_notes": "Alpha matte using the project Nova cutout path. Original product interior retained; only white-contaminated edge pixels decontaminated. Studio shadow removed; source original retained.",
                   "verification_method": "manual visual review of cutout over navy and ivory backgrounds",
                   **{k: v for k, v in image_metrics(destination.read_bytes()).items() if k in
                      ("width", "height", "format", "byte_size", "sha256", "perceptual_hash")}})
rows.append(derivative)
output = PROCESSED / "library-pilot-approved.jsonl"
if output.exists():
    raise FileExistsError(output)
output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
index_file = LIBRARY / "index.json"
backup = BACKUPS / f"index.before-approved-cutout-{date.today()}.json"
if backup.exists():
    raise FileExistsError(backup)
shutil.copyfile(index_file, backup)
index = json.loads(index_file.read_text(encoding="utf-8"))
next(row for row in index if row["slug"] == "moondrop-variations")["file"] = destination.name
index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"approved cutout: {destination}; {len(rows)} library records")
