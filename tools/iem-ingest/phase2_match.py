"""Local-only model-to-public-catalogue candidate discovery; never auto-approve."""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
IEMS = json.loads((DATA / "phase2-catalogue-baseline.json").read_text(encoding="utf-8"))
SOURCE_FILES = {
    "Linsoul": DATA / "linsoul-products.json",
    "HiFiGo": DATA / "phase2-hifigo-products.json",
    "ShenzhenAudio": DATA / "phase2-shenzhenaudio-products.json",
    "Apos": DATA / "phase2-apos-products.json",
    "Headphones.com": DATA / "phase2-headphones-products.json",
}
ORIGINS = {"Linsoul": "https://www.linsoul.com", "HiFiGo": "https://hifigo.com",
           "ShenzhenAudio": "https://shenzhenaudio.com", "Apos": "https://apos.audio",
           "Headphones.com": "https://headphones.com"}
ALIASES = {"Shuoer": ("shuoer", "letshuoer"), "FiiO": ("fiio",),
           "Final Audio": ("finalaudio", "final"), "1MORE": ("1more",),
           "ThieAudio": ("thieaudio",), "Thieaudio": ("thieaudio",),
           "Dunu": ("dunu",), "Softears": ("softears", "soft ears")}


def compact(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


products = []
for source, path in SOURCE_FILES.items():
    payload = json.loads(path.read_text(encoding="utf-8"))
    for p in payload["products"] if isinstance(payload, dict) else payload:
        if not p.get("images"):
            continue
        products.append({"source": source, "title": p.get("title", ""),
                         "handle": p.get("handle", ""),
                         "page_url": f"{ORIGINS[source]}/products/{p.get('handle', '')}",
                         "image_urls": [im["src"] for im in p.get("images", []) if im.get("src")],
                         "variant_count": len(p.get("variants", [])),
                         "price_usd": p.get("variants", [{}])[0].get("price") if p.get("variants") else None})

matches = []
for iem in IEMS:
    brand = compact(iem["brand"])
    model = compact(iem["model"])
    aliases = [compact(x) for x in ALIASES.get(iem["brand"], (brand,))]
    candidates = []
    for p in products:
        title = compact(p["title"])
        handle = compact(p["handle"])
        if not any(alias in title or alias in handle for alias in aliases):
            continue
        # Remove one matching brand so suffix/prefix marketing text does not
        # overwhelm the model comparison. This only makes suggestions.
        residual = title
        for alias in aliases:
            residual = residual.replace(alias, "", 1)
        similarity = SequenceMatcher(None, model, residual).ratio()
        contained = model in residual and len(model) >= 3
        exact = residual == model
        score = (1.0 if exact else 0.9 if contained else 0.7 * similarity)
        if score < 0.40:
            continue
        candidates.append({**p, "match_score_heuristic": round(score, 3),
                           "match_class": "exact_title" if exact else
                             "title_contains_model" if contained else "fuzzy_review"})
    candidates.sort(key=lambda p: (p["match_score_heuristic"], len(p["image_urls"])), reverse=True)
    matches.append({**iem, "candidates": candidates[:5]})

target = DATA / "phase2-image-matches.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(matches, handle, indent=2, ensure_ascii=False)
print({"models": len(matches), "with_candidate": sum(bool(x["candidates"]) for x in matches),
       "exact_title": sum(any(c["match_class"] == "exact_title" for c in x["candidates"]) for x in matches),
       "no_candidate": [x["slug"] for x in matches if not x["candidates"]]})
