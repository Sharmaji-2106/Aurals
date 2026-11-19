"""Probe public first-party product JSON endpoints without search scraping."""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from intake import Blocked, cached_get

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "Linsoul": "https://www.linsoul.com/products.json?limit=250&page=1",
    "HiFiGo": "https://hifigo.com/products.json?limit=250&page=1",
    "ShenzhenAudio": "https://shenzhenaudio.com/products.json?limit=250&page=1",
    "Apos": "https://apos.audio/products.json?limit=250&page=1",
    "Headphones.com": "https://headphones.com/products.json?limit=250&page=1",
    "Moondrop": "https://moondroplab.com/products.json?limit=250&page=1",
}

results = []
for name, url in SOURCES.items():
    start = time.monotonic()
    try:
        payload = json.loads(cached_get(url))
        products = payload.get("products", [])
        outcome = {"source": name, "url": url, "status": "ok", "products": len(products),
                   "images": sum(len(p.get("images", [])) for p in products),
                   "bytes": len(json.dumps(payload).encode("utf-8")),
                   "seconds": round(time.monotonic() - start, 2)}
    except (Blocked, httpx.HTTPError, json.JSONDecodeError, OSError) as exc:
        outcome = {"source": name, "url": url, "status": str(exc),
                   "seconds": round(time.monotonic() - start, 2)}
    results.append(outcome)
    print(outcome)

target = ROOT / "data/iem/reports/phase2-source-probe.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump({"probed_at": datetime.now(UTC).isoformat(), "results": results}, handle, indent=2)
