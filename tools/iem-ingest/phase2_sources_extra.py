"""Additional public, direct product-catalogue probes for old and niche IEMs."""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

from intake import Blocked, cached_get

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "Campfire Audio": "https://campfireaudio.com",
    "Audio46": "https://audio46.com",
    "Bloom Audio": "https://bloomaudio.com",
    "MusicTeck": "https://shop.musicteck.com",
    "Etymotic": "https://etymotic.com",
    "Westone Audio": "https://westoneaudio.com",
    "Soundcore": "https://www.soundcore.com",
    "Final Audio": "https://final-inc.com",
    "FiiO": "https://www.fiio.com",
    "Sennheiser": "https://www.sennheiser-hearing.com",
    "Thieaudio": "https://www.thieaudio.com",
    "Moondrop Audio": "https://moondropaudio.com",
}

results = []
for source, origin in SOURCES.items():
    url = origin + "/products.json?limit=250&page=1"
    start = time.monotonic()
    try:
        content = cached_get(url)
        data = json.loads(content)
        products = data.get("products", [])
        result = {"source": source, "origin": origin, "status": "ok", "products": len(products),
                  "images": sum(len(p.get("images", [])) for p in products),
                  "bytes": len(content), "seconds": round(time.monotonic()-start, 2)}
    except (Blocked, httpx.HTTPError, json.JSONDecodeError, OSError) as exc:
        result = {"source": source, "origin": origin, "status": str(exc),
                  "seconds": round(time.monotonic()-start, 2)}
    results.append(result)
    print(result)

target = ROOT / "data/iem/reports/phase2-source-probe-extra.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(results, handle, indent=2)
