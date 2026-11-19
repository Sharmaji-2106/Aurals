"""Cache public retailer product catalogues with exact page provenance."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx

from intake import Blocked, cached_get

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "hifigo": "https://hifigo.com",
    "shenzhenaudio": "https://shenzhenaudio.com",
    "apos": "https://apos.audio",
    "headphones": "https://headphones.com",
}

for key, origin in SOURCES.items():
    target = ROOT / f"data/iem/processed/phase2-{key}-products.json"
    if target.exists():
        print(f"{key}: existing normalized file; skipped")
        continue
    products = []
    sources = []
    for page in range(1, 13):
        url = f"{origin}/products.json?limit=250&page={page}"
        try:
            content = cached_get(url)
            batch = json.loads(content)["products"]
        except (Blocked, httpx.HTTPError, ValueError, KeyError) as exc:
            print(f"{key} page {page}: {exc}")
            break
        products.extend(batch)
        sources.append({"url": url, "count": len(batch), "bytes": len(content)})
        print(f"{key} page {page}: {len(batch)} products")
        if len(batch) < 250:
            break
    if products:
        with target.open("x", encoding="utf-8") as handle:
            json.dump({"source": key, "origin": origin, "retrieved_at": datetime.now(UTC).isoformat(),
                       "pages": sources, "products": products}, handle, ensure_ascii=False)
        print(f"{key}: {len(products)} total products")
