"""Approve hand-inspected pilot photographs, preserving source bytes exactly."""

from __future__ import annotations

import hashlib
import json
import shutil
from collections import deque
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "data/iem-images"
PROCESSED = ROOT / "data/iem/processed"
REPORT = ROOT / "data/iem/reports/image-probe.json"
BACKUPS = ROOT / "data/iem/backups"

# Each selection was inspected on the contact sheet. No filename-only approvals.
APPROVED = {
    "moondrop-variations": ("moondrop-variations", 0),
    "kiwi-ears-orchestra-lite": ("kiwi-ears-orchestra-lite", 0),
    "moondrop-quarks": ("moondrop-quarks", 0),
    "7hz-salnotes-zero": ("7hz-salnotes-zero", 0),
    "7hz-timeless": ("7hz-timeless", 0),
    "kz-zsn-pro-x": ("kz-zsn-pro-x", 0),
    "kiwi-ears-cadenza": ("kiwi-ears-cadenza", 0),
    "kz-castor": ("kz-castor", 0),
}


def matte_white(image: Image.Image) -> Image.Image:
    """Remove only border-connected near-white backdrop; retain every RGB pixel."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    alpha = Image.new("L", rgb.size, 255)
    pixels = rgb.load()
    mask = alpha.load()
    assert pixels is not None and mask is not None
    queue = deque([(x, 0) for x in range(width)] + [(x, height - 1) for x in range(width)]
                  + [(0, y) for y in range(height)] + [(width - 1, y) for y in range(height)])
    visited = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        r, g, b = pixels[x, y]
        if min(r, g, b) < 245 or max(r, g, b) - min(r, g, b) > 12:
            continue
        mask[x, y] = 0
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                queue.append((nx, ny))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def run() -> None:
    rows = json.loads(REPORT.read_text(encoding="utf-8"))
    by_handle: dict[str, list[dict]] = {}
    for row in rows:
        if "file" in row:
            by_handle.setdefault(row["handle"], []).append(row)
    manifest = []
    index_path = LIBRARY / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    existing = {row["slug"] for row in index}
    for handle, (slug, selection) in APPROVED.items():
        if slug in existing:
            raise ValueError(f"legacy index already contains {slug}")
        source = by_handle[handle][selection]
        candidate = ROOT / source["file"]
        folder = LIBRARY / "originals" / slug
        folder.mkdir(parents=True, exist_ok=True)
        original = folder / candidate.name
        if original.exists():
            raise FileExistsError(original)
        shutil.copyfile(candidate, original)
        if original.read_bytes() != candidate.read_bytes():
            raise OSError(f"source bytes changed: {original}")
        original_rel = original.relative_to(LIBRARY).as_posix()
        common = {
            "slug": slug, "source_name": "Linsoul", "page_url": source["page_url"],
            "image_url": source["image_url"], "credit": "Linsoul product photography; photographer unknown",
            "retrieved_on": date.today().isoformat(),
            "licence_note": "Copyrighted product photograph; reuse permission unconfirmed.",
            "verification_status": "verified", "verification_method": "manual visual contact-sheet inspection",
            "verification_note": "Model and visible shell details match the labelled retailer listing; colourway as shown.",
            "quality_score": source["quality_score_heuristic"],
        }
        primary_rel = original_rel
        original_role = "primary"
        if slug == "moondrop-variations":
            original_role = "original"
        manifest.append({**common, "file_path": original_rel, "role": original_role,
                         **{key: source[key] for key in ("width", "height", "format", "byte_size", "sha256", "perceptual_hash")}})
        if slug == "moondrop-variations":
            derivative = LIBRARY / "moondrop-variations-display.webp"
            if derivative.exists():
                raise FileExistsError(derivative)
            with Image.open(original) as image:
                image.load()
                matte_white(image).save(derivative, format="WEBP", quality=92)
            data = derivative.read_bytes()
            with Image.open(derivative) as image:
                image.load()
                width, height = image.size
            primary_rel = derivative.relative_to(LIBRARY).as_posix()
            manifest.append({**common, "file_path": primary_rel, "role": "primary",
                "derived_from": original_rel, "width": width, "height": height,
                "format": "WEBP", "byte_size": len(data),
                "sha256": hashlib.sha256(data).hexdigest(), "perceptual_hash": None,
                "processing_notes": "Border-connected near-white backdrop alpha matte; RGB product pixels unchanged; original retained."})
            alternate = by_handle[handle][1]
            alt_candidate = ROOT / alternate["file"]
            alt_file = folder / alt_candidate.name
            if alt_file.exists():
                raise FileExistsError(alt_file)
            shutil.copyfile(alt_candidate, alt_file)
            manifest.append({**common, "file_path": alt_file.relative_to(LIBRARY).as_posix(),
                "role": "alternate", "image_url": alternate["image_url"],
                **{key: alternate[key] for key in ("width", "height", "format", "byte_size", "sha256", "perceptual_hash")},
                "verification_note": "Alternate close-up visibly reads VARIATIONS on the actual faceplate."})
        index.append({"slug": slug, "file": primary_rel, "source": "Linsoul",
                      "source_url": source["page_url"], "credit": common["credit"],
                      "retrieved_on": date.today().isoformat(), "licence_note": common["licence_note"]})
    output = PROCESSED / "library-pilot.jsonl"
    if output.exists():
        raise FileExistsError(output)
    output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in manifest), encoding="utf-8")
    if not (BACKUPS / "index.orig-2026-11-12.json").exists():
        raise RuntimeError("legacy index backup missing")
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"approved {len(APPROVED)} primary models, {len(manifest)} library records")


if __name__ == "__main__":
    run()
