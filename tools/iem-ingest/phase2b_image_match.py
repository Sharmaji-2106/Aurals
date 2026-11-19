"""Find local retailer catalogue leads for every IEM without a primary image."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from phase2_images import SOURCES

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
ACCESSORY = re.compile(r"\b(cables?|eartips?|ear[ -]?tips?|replacement|protective|adapter|carrying|case only|filter set|upgrade kit|neckband|ear pads?)\b", re.I)
REVISION = re.compile(r"^(ii|iii|iv|mk[ivx0-9]+|pro|plus|ultra|2|3|4|se|dsp|2020|2023|2024|2025|2026)\b", re.I)
ALIASES = {"Shuoer": ("Shuoer", "Letshuoer"), "Final Audio": ("Final Audio", "Final"),
           "Softears": ("Softears", "Soft Ears"), "Dunu": ("Dunu", "DUNU"),
           "Thieaudio": ("Thieaudio", "ThieAudio"), "XENNS": ("XENNS", "Xenns Mangird"),
           "Simgot": ("Simgot", "Simgot Audio"), "AFUL": ("AFUL", "AFUL Acoustics")}


def compact(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def main() -> None:
    identity_file = sys.argv[1] if len(sys.argv) > 1 else "phase2b-catalogue-identities-after-superreview.json"
    output_label = sys.argv[2] if len(sys.argv) > 2 else "phase2b"
    identities = json.loads((DATA / identity_file).read_text(encoding="utf-8"))
    checklist = {compact(r["brand"] + r["model"]): int(r["priority"]) for r in csv.DictReader((ROOT / "data/iem/market/coverage.csv").open(encoding="utf-8"))}
    ranked = {row["slug"] for row in json.loads((ROOT / "data/iem/reports/ranking-phase2-batch2-after.json").read_text(encoding="utf-8"))["sample"]}
    products = []
    for source, (filename, origin) in SOURCES.items():
        payload = json.loads((DATA / filename).read_text(encoding="utf-8"))
        for item in payload["products"] if isinstance(payload, dict) else payload:
            if not item.get("images") or ACCESSORY.search(item.get("title", "")):
                continue
            products.append((source, item))
    matches, unresolved = [], []
    for iem in identities:
        if iem["image_path"]:
            continue
        model = compact(iem["model"])
        if len(model) < 3:
            unresolved.append({"slug": iem["slug"], "reason": "model name too short for automatic retailer match"})
            continue
        aliases = ALIASES.get(iem["brand"], (iem["brand"],))
        choices = []
        for source, product in products:
            title = product["title"]
            folded = compact(title)
            for alias in aliases:
                brand = compact(alias)
                if brand not in folded:
                    continue
                residual = folded.replace(brand, "", 1)
                if model not in residual:
                    continue
                tail = residual.split(model, 1)[1]
                if REVISION.match(tail):
                    continue
                prefix = residual.split(model, 1)[0]
                if len(prefix) > 12 or (prefix and prefix not in {"audio", "brand", "new"}):
                    continue
                score = (100 if residual == model else 95 if not tail else 88)
                if source in ("Etymotic", "Westone Audio", "Final Audio", "Thieaudio"):
                    score += 2
                if "Open Box" in title or "Discontinued" in title:
                    score -= 2
                choices.append({"slug": iem["slug"], "brand": iem["brand"], "model": iem["model"],
                                "source": source, "title": title, "score": score,
                                "tail_after_model": tail, "image_count": len(product["images"]),
                                "handle": product["handle"]})
                break
        choices.sort(key=lambda r: (r["score"], r["image_count"]), reverse=True)
        if choices:
            matches.append({"slug": iem["slug"], "ranked": iem["slug"] in ranked,
                            "priority": checklist.get(compact(iem["brand"] + iem["model"]), 9999),
                            "choices": choices[:5]})
        else:
            unresolved.append({"slug": iem["slug"], "reason": "no title match in 12 cached public retailer/manufacturer Shopify feeds"})
    matches.sort(key=lambda row: (not row["ranked"], row["priority"], row["slug"]))
    with (DATA / f"{output_label}-image-leads.json").open("x", encoding="utf-8") as handle:
        json.dump(matches, handle, ensure_ascii=False, indent=2)
    with (DATA / f"{output_label}-image-no-shopify-title-match.json").open("x", encoding="utf-8") as handle:
        json.dump(unresolved, handle, ensure_ascii=False, indent=2)
    exact = sum(m["choices"][0]["score"] >= 100 for m in matches)
    print({"catalogue": len(identities), "already_has_path": sum(bool(i["image_path"]) for i in identities),
           "missing_with_lead": len(matches), "top_exact": exact, "no_lead": len(unresolved)})


if __name__ == "__main__":
    main()
