"""Reject imperfect trial mattes and register the existing proven Nova matte."""

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

rows = [json.loads(line) for line in (PROCESSED / "library-pilot.jsonl").read_text(encoding="utf-8").splitlines()]
rows = [row for row in rows if row["file_path"] != "moondrop-variations-display.webp"]
for row in rows:
    if row["slug"] == "moondrop-variations" and row["role"] == "original":
        row["role"] = "primary"
        row["verification_note"] = "Pair image visibly reads VARIATIONS; studio backdrop retained after rejected matte trials."

source = ROOT / "web/public/book/products/nova-studio.jpg"
destination = LIBRARY / "originals/truthear-nova/nova-studio.jpg"
destination.parent.mkdir(parents=True, exist_ok=True)
if destination.exists():
    raise FileExistsError(destination)
shutil.copyfile(source, destination)
if source.read_bytes() != destination.read_bytes():
    raise OSError("Nova original changed during copy")
image_url = "https://cdn.prod.website-files.com/63bcdfa5158ffcd72a7a8d8e/66457fd840bb2326343c0f1f_NOVA.jpg"
common = {"slug": "truthear-nova", "source_name": "Truthear",
          "page_url": "https://truthear.com/products/nova", "image_url": image_url,
          "credit": "Truthear, manufacturer product photograph", "retrieved_on": date.today().isoformat(),
          "licence_note": "Copyrighted manufacturer photograph; commercial reuse permission unconfirmed.",
          "verification_status": "verified", "verification_method": "manual visual comparison of local studio original and existing matte",
          "verification_note": "The existing book asset shows Nova in the studio photograph; the card cutout depicts the same pair."}
original_rel = destination.relative_to(LIBRARY).as_posix()
rows.append({**common, "file_path": original_rel, "role": "original",
             **{k: v for k, v in image_metrics(destination.read_bytes()).items() if k in
                ("width", "height", "format", "byte_size", "sha256", "perceptual_hash")}})
derivative = LIBRARY / "truthear-nova.webp"
rows.append({**common, "file_path": "truthear-nova.webp", "role": "primary",
             "derived_from": original_rel,
             "processing_notes": "Existing design/book/cutout.py studio matte; original RGB retained in separate source file.",
             **{k: v for k, v in image_metrics(derivative.read_bytes()).items() if k in
                ("width", "height", "format", "byte_size", "sha256", "perceptual_hash")}})

output = PROCESSED / "library-pilot-final.jsonl"
if output.exists():
    raise FileExistsError(output)
output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")

index_path = LIBRARY / "index.json"
backup = BACKUPS / "index.before-final-selection-2026-11-12.json"
if backup.exists():
    raise FileExistsError(backup)
shutil.copyfile(index_path, backup)
index = json.loads(index_path.read_text(encoding="utf-8"))
variations = next(row for row in index if row["slug"] == "moondrop-variations")
variations["file"] = next(row["file_path"] for row in rows if row["slug"] == "moondrop-variations" and row["role"] == "primary")
index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"final library: {len(rows)} records, 9 primary models")
