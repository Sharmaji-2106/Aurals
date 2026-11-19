"""Copy manually verified original bytes into approved library without DB writes."""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from datetime import date
from pathlib import Path

import imagehash

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
LIB = ROOT / "data/iem-images"
REPORTS = ROOT / "data/iem/reports"


def run(batch: int) -> None:
    selection = json.loads((DATA / f"phase2-image-batch{batch}-decisions.json").read_text(encoding="utf-8"))
    candidates = json.loads((DATA / f"phase2-image-batch{batch}-candidates.json").read_text(encoding="utf-8"))
    grouped = defaultdict(list)
    for record in candidates:
        if "file" in record:
            grouped[record["slug"]].append(record)
    if set(selection) != set(grouped):
        raise ValueError(f"decision/candidate mismatch: {set(selection) ^ set(grouped)}")
    manifest = []
    rejected = []
    approved_hashes: dict[str, str] = {}
    for slug, decision in selection.items():
        if decision.get("primary") is None:
            rejected.append({"slug": slug, "reason": decision["note"]})
            continue
        prior_hashes = []
        for number in [decision["primary"], *decision["alternates"]]:
            record = grouped[slug][number - 1]
            phash = imagehash.hex_to_hash(record["perceptual_hash"])
            if any(phash - previous <= 4 for previous in prior_hashes):
                rejected.append({"slug": slug, "position": number, "reason": "pHash distance <= 4 from selected image"})
                continue
            prior_hashes.append(phash)
            previous_slug = approved_hashes.get(record["sha256"])
            if previous_slug and previous_slug != slug:
                rejected.append({"slug": slug, "position": number,
                                 "reason": f"exact bytes already approved for {previous_slug}"})
                continue
            approved_hashes[record["sha256"]] = slug
            original = ROOT / record["file"]
            target = LIB / "originals" / slug / original.name
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if target.read_bytes() != original.read_bytes():
                    raise ValueError(f"existing approved file differs: {target}")
            else:
                shutil.copyfile(original, target)
            source = record["source"]
            credit = (f"{source}, manufacturer product photography" if source in ("Etymotic", "Thieaudio")
                      else f"{source} product photography; photographer unknown")
            manifest.append({
                "slug": slug, "file_path": str(target.relative_to(LIB)).replace("\\", "/"),
                "role": "original" if number == decision["primary"] else "alternate",
                "width": record["width"], "height": record["height"], "format": record["format"],
                "byte_size": record["byte_size"], "sha256": record["sha256"],
                "perceptual_hash": record["perceptual_hash"],
                "source_name": source, "page_url": record["page_url"],
                "image_url": record["image_url"], "credit": credit,
                "retrieved_on": date.fromisoformat(record["retrieved_at"][:10]).isoformat(),
                "licence_note": "Copyrighted authentic product photograph; reuse permission unconfirmed.",
                "verification_status": "verified",
                "verification_method": f"manual visual inspection of phase2 batch {batch} contact sheets and exact source listing",
                "verification_note": decision["note"] + (" Primary source original." if number == decision["primary"]
                                                         else " Alternate original angle."),
                "quality_score": record["quality_score_heuristic"],
                "processing_notes": "Original CDN bytes copied without alteration.",
            })
    output = DATA / f"phase2-batch{batch}-library-sources.jsonl"
    with output.open("x", encoding="utf-8") as handle:
        for row in manifest:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    report = REPORTS / f"phase2-batch{batch}-duplicate-review.json"
    with report.open("x", encoding="utf-8") as handle:
        json.dump({"rejected": rejected, "approved": len(manifest)}, handle, indent=2)
    print({"models": len(selection), "approved_source_images": len(manifest),
           "phash_or_sha_rejections": len(rejected)})


if __name__ == "__main__":
    import sys
    run(int(sys.argv[1]))
