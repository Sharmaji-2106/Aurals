"""Download manually resolved retailer/gallery originals for visual review."""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path

import httpx

from intake import Blocked, cached_get, image_metrics

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
SOURCES = {
    "Linsoul": ("linsoul-products.json", "https://www.linsoul.com"),
    "HiFiGo": ("phase2-hifigo-products.json", "https://hifigo.com"),
    "ShenzhenAudio": ("phase2-shenzhenaudio-products.json", "https://shenzhenaudio.com"),
    "Apos": ("phase2-apos-products.json", "https://apos.audio"),
    "Headphones.com": ("phase2-headphones-products.json", "https://headphones.com"),
    "Audio46": ("phase2-audio46-products.json", "https://audio46.com"),
    "Bloom Audio": ("phase2-bloom-products.json", "https://bloomaudio.com"),
    "MusicTeck": ("phase2-musicteck-products.json", "https://shop.musicteck.com"),
    "Etymotic": ("phase2-etymotic-products.json", "https://etymotic.com"),
    "Westone Audio": ("phase2-westone-products.json", "https://westoneaudio.com"),
    "Final Audio": ("phase2-final-products.json", "https://final-inc.com"),
    "Thieaudio": ("phase2-thieaudio-products.json", "https://www.thieaudio.com"),
}


def run(batch: int) -> None:
    selection = json.loads((DATA / f"phase2-image-batch{batch}-selection.json").read_text(encoding="utf-8"))
    catalogues = {}
    for source, (filename, _) in SOURCES.items():
        payload = json.loads((DATA / filename).read_text(encoding="utf-8"))
        catalogues[source] = payload["products"] if isinstance(payload, dict) else payload
    records = []
    for selected in selection:
        source = selected["source"]
        matches = [item for item in catalogues[source] if item.get("title") == selected["title"]]
        if len(matches) != 1:
            records.append({**selected, "error": f"product title resolved to {len(matches)} records"})
            print(f"{selected['slug']}: title resolved to {len(matches)} records")
            continue
        product = matches[0]
        _, origin = SOURCES[source]
        page_url = origin + "/products/" + product["handle"]
        # Bulk batches prioritize primary coverage; two originals give a second
        # visual angle without tripling acquisition time across hundreds of models.
        for image in product.get("images", [])[:2 if batch >= 3 else 3]:
            url = image.get("src")
            if not url:
                continue
            parsed = urllib.parse.urlsplit(url)
            clean = urllib.parse.urlunsplit(("https", parsed.netloc, parsed.path, "", ""))
            try:
                body = cached_get(clean)
                metrics = image_metrics(body)
                folder = ROOT / "data/iem/images/candidates" / selected["slug"]
                folder.mkdir(parents=True, exist_ok=True)
                extension = Path(parsed.path).suffix.lower() or ".jpg"
                file = folder / (hashlib.sha256(body).hexdigest()[:16] + extension)
                if not file.exists():
                    file.write_bytes(body)
                records.append({**selected, "page_url": page_url, "image_url": clean,
                                "file": str(file.relative_to(ROOT)),
                                "source_image_position": image.get("position"),
                                "retrieved_at": datetime.now(UTC).isoformat(), **metrics})
            except (Blocked, httpx.HTTPError, OSError, ValueError) as exc:
                records.append({**selected, "page_url": page_url, "image_url": clean,
                                "error": str(exc)})
        print(f"{selected['slug']}: {sum(r.get('slug') == selected['slug'] and 'file' in r for r in records)} images")
    target = DATA / f"phase2-image-batch{batch}-candidates.json"
    with target.open("x", encoding="utf-8") as handle:
        json.dump(records, handle, indent=2, ensure_ascii=False)
    print({"requested_models": len(selection), "valid_images": sum("file" in r for r in records),
           "errors": sum("error" in r for r in records)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("batch", type=int)
    run(parser.parse_args().batch)
