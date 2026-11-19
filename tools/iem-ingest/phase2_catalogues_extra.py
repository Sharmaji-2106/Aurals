"""Cache additional public Shopify catalogue pages and source provenance."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

from intake import Blocked, cached_get

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "audio46": "https://audio46.com", "bloom": "https://bloomaudio.com",
    "musicteck": "https://shop.musicteck.com", "etymotic": "https://etymotic.com",
    "westone": "https://westoneaudio.com", "final": "https://final-inc.com",
    "thieaudio": "https://www.thieaudio.com",
}

for key, origin in SOURCES.items():
    target = ROOT / f"data/iem/processed/phase2-{key}-products.json"
    if target.exists():
        print(f"{key}: existing normalized file; skipped")
        continue
    products = []
    pages = []
    for number in range(1, 13):
        url = f"{origin}/products.json?limit=250&page={number}"
        try:
            body = cached_get(url)
            batch = json.loads(body)["products"]
        except (Blocked, httpx.HTTPError, ValueError, KeyError) as exc:
            print(f"{key} page {number}: {exc}")
            break
        products.extend(batch)
        pages.append({"url": url, "count": len(batch), "bytes": len(body)})
        print(f"{key} page {number}: {len(batch)}")
        if len(batch) < 250:
            break
    if products:
        with target.open("x", encoding="utf-8") as handle:
            json.dump({"source": key, "origin": origin, "retrieved_at": datetime.now(UTC).isoformat(),
                       "pages": pages, "products": products}, handle, ensure_ascii=False)
        print(f"{key}: {len(products)} total")
