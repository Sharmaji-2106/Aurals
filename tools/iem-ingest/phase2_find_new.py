"""Find local catalogue image leads for newly measured IEMs, without queries to stores."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
SOURCE_FILES = {
    "Linsoul": "linsoul-products.json", "HiFiGo": "phase2-hifigo-products.json",
    "ShenzhenAudio": "phase2-shenzhenaudio-products.json", "Apos": "phase2-apos-products.json",
    "Headphones.com": "phase2-headphones-products.json", "Audio46": "phase2-audio46-products.json",
    "Bloom Audio": "phase2-bloom-products.json", "MusicTeck": "phase2-musicteck-products.json",
    "Etymotic": "phase2-etymotic-products.json", "Westone Audio": "phase2-westone-products.json",
    "Final Audio": "phase2-final-products.json", "Thieaudio": "phase2-thieaudio-products.json",
}


def compact(value: str) -> str:
    return re.sub("[^a-z0-9]", "", value.lower())


models = [json.loads(line) for line in (DATA / "phase2-measurements-superreview-batch1-valid.jsonl")
          .read_text(encoding="utf-8").splitlines()]
catalogues = {}
for source, file in SOURCE_FILES.items():
    data = json.loads((DATA / file).read_text(encoding="utf-8"))
    catalogues[source] = data["products"] if isinstance(data, dict) else data
results = []
for model in models:
    label = model["brand"] + " " + model["model"]
    key = compact(model["model"])
    brand = compact(model["brand"])
    found = []
    for source, products in catalogues.items():
        for product in products:
            title = str(product.get("title", ""))
            normalized = compact(title)
            if key in normalized and brand in normalized and product.get("images"):
                found.append({"source": source, "title": title, "handle": product.get("handle"),
                              "images": len(product["images"])})
    found.sort(key=lambda p: (compact(p["title"]) != compact(label), len(p["title"])))
    results.append({"brand": model["brand"], "model": model["model"], "candidates": found[:12]})
    print(label, "|", " ; ".join(p["source"] + ": " + p["title"] for p in found[:4]))
with (DATA / "phase2-new-measurement-image-leads.json").open("x", encoding="utf-8") as handle:
    json.dump(results, handle, ensure_ascii=False, indent=2)
