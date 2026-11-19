"""Publish reviewed matte derivatives and final primary/alternate manifest."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from intake import image_metrics

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
LIB = ROOT / "data/iem-images"
REPORTS = ROOT / "data/iem/reports"


def run(batch: int) -> None:
    source_rows = [json.loads(line) for line in (DATA / f"phase2-batch{batch}-library-sources.jsonl")
                   .read_text(encoding="utf-8").splitlines()]
    decisions = json.loads((DATA / f"phase2-batch{batch}-matte-decisions.json").read_text(encoding="utf-8"))
    originals = {row["slug"]: row for row in source_rows if row["role"] == "original"}
    accepted = set(decisions["accepted"])
    rejected = set(decisions["rejected"])
    transparent = set(decisions["already_transparent"])
    if accepted | rejected | transparent != set(originals) or (accepted & rejected) or (accepted & transparent):
        raise ValueError("every primary must have exactly one matte decision")
    manifest = []
    for row in source_rows:
        output = dict(row)
        if row["role"] == "original" and row["slug"] not in accepted:
            output["role"] = "primary"
            if row["slug"] in rejected:
                output["processing_notes"] += " Matte trial rejected: " + decisions["rejected"][row["slug"]]
            else:
                with Image.open(LIB / row["file_path"]) as source:
                    if "transparency" not in source.info and "A" not in source.getbands():
                        raise ValueError(f"claimed transparent original has no alpha: {row['slug']}")
                output["processing_notes"] += " Source original already has transparency."
        manifest.append(output)
        if row["role"] != "original" or row["slug"] not in accepted:
            continue
        trial = REPORTS / f"matte-trials-batch{batch}/{row['slug']}.png"
        with Image.open(LIB / row["file_path"]) as source:
            rgb = np.asarray(source.convert("RGB"))
        with Image.open(trial) as cutout:
            rgba = np.asarray(cutout.convert("RGBA"))
        core = rgba[:, :, 3] == 255
        if not np.array_equal(rgb[core], rgba[:, :, :3][core]):
            raise ValueError(f"opaque product RGB changed in {row['slug']} matte")
        original_fraction = float(core.mean())
        if original_fraction < 0.01:
            raise ValueError(f"matte has too little opaque product: {row['slug']}")
        target = LIB / "derived" / row["slug"] / (row["sha256"][:16] + "-matte.png")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if target.read_bytes() != trial.read_bytes():
                raise ValueError(f"existing derivative differs: {target}")
        else:
            shutil.copyfile(trial, target)
        content = target.read_bytes()
        metrics = image_metrics(content)
        manifest.append({**row, "file_path": str(target.relative_to(LIB)).replace("\\", "/"),
                         "role": "primary", "derived_from": row["file_path"],
                         "format": "PNG", "byte_size": len(content),
                         "sha256": hashlib.sha256(content).hexdigest(),
                         "perceptual_hash": metrics["perceptual_hash"],
                         "quality_score": row["quality_score"],
                         "processing_notes": "Border-connected studio matte; edge RGB decontaminated only where alpha < 255; original core RGB verified byte-identical after decode. Original source retained.",
                         "verification_note": row["verification_note"] +
                         " Matte accepted after dark/light manual review; no visible missing cables/tips or halo."})
    output = DATA / f"phase2-batch{batch}-library-final.jsonl"
    with output.open("x", encoding="utf-8") as handle:
        for row in manifest:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print({"models": len(originals), "records": len(manifest), "accepted_mattes": len(accepted),
           "rejected_mattes": len(rejected), "already_transparent": len(transparent)})


if __name__ == "__main__":
    import sys
    run(int(sys.argv[1]))
