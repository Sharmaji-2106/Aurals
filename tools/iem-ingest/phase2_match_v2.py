"""Local-only image leads, excluding accessories and likely revision collisions."""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
IEMS = json.loads((DATA / "phase2-catalogue-baseline.json").read_text(encoding="utf-8"))
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
ALIASES = {"Shuoer": ("shuoer", "letshuoer"), "Final Audio": ("finalaudio", "final"),
           "InEar": ("inear", "in ear"), "1MORE": ("1more",),
           "Softears": ("softears", "soft ears")}
ACCESSORY = re.compile(r"\b(cable|earpads?|ear[ -]?tips?|memory foam|case|filter|adapter|"
                       r"replacement|protective|upgrade|connector|carrying pouch|eartips)\b", re.I)
REVISION = re.compile(r"^(ii|iii|iv|mk[ivx0-9]+|pro|plus|2|3|4|se|dsp|2020|2023)\b", re.I)


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


products = []
for source, (filename, origin) in SOURCES.items():
    data = json.loads((DATA / filename).read_text(encoding="utf-8"))
    for item in data["products"] if isinstance(data, dict) else data:
        title = item.get("title", "")
        if not item.get("images") or ACCESSORY.search(title):
            continue
        products.append({"source": source, "title": title, "handle": item.get("handle", ""),
                         "page_url": origin + "/products/" + item.get("handle", ""),
                         "image_urls": [x["src"] for x in item["images"] if x.get("src")],
                         "price_usd": item.get("variants", [{}])[0].get("price") if item.get("variants") else None,
                         "variant_count": len(item.get("variants", []))})

results = []
for iem in IEMS:
    model = compact(iem["model"])
    aliases = [compact(x) for x in ALIASES.get(iem["brand"], (iem["brand"],))]
    candidates = []
    for p in products:
        title = compact(p["title"])
        brand_hit = next((alias for alias in aliases if alias in title), None)
        if not brand_hit:
            continue
        residual = title.replace(brand_hit, "", 1)
        exact = residual == model
        contained = model in residual and len(model) >= 3
        if contained:
            tail = residual.split(model, 1)[1]
            if REVISION.match(tail) and tail != compact(iem["model"]):
                continue
        similarity = SequenceMatcher(None, model, residual).ratio()
        score = 1.0 if exact else 0.9 if contained else 0.7 * similarity
        if score < 0.43:
            continue
        if p["source"] in ("Etymotic", "Westone Audio", "Final Audio", "Thieaudio"):
            score += 0.02
        candidates.append({**p, "match_score_heuristic": round(score, 3),
                           "match_class": "exact_title" if exact else
                             "title_contains_model" if contained else "fuzzy_review"})
    candidates.sort(key=lambda x: (x["match_score_heuristic"], len(x["image_urls"])), reverse=True)
    results.append({**iem, "candidates": candidates[:8]})

target = DATA / "phase2-image-matches-v2.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(results, handle, ensure_ascii=False, indent=2)
print({"models": len(results), "candidate": sum(bool(x["candidates"]) for x in results),
       "exact": sum(any(c["match_class"] == "exact_title" for c in x["candidates"]) for x in results),
       "no_candidate": sum(not x["candidates"] for x in results)})
