"""Normalize pinned AutoEq Super Review in-ear CSVs, preserving source provenance.

The first run selects unparenthesized product names. Parenthesized configurations
need a separate identity/variant review and are reported as deferred.
"""

from __future__ import annotations

import csv
import json
import math
import re
import urllib.parse
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIN = "7ae0f56d53074872b028649617a22bbb4232feb7"
SOURCE = ROOT / "data/iem/raw/autoeq-sparse-phase2b/measurements/Super Review"
OUT = ROOT / "data/iem/processed"
BRANDS = (
    "64 Audio", "7th Acoustics", "AFUL Acoustics", "Alpha Omega", "Binary Acoustics",
    "Bang & Olufsen", "Bowers & Wilkins", "Cambridge Audio", "Campfire Audio", "Cosmic Ears", "DITA Audio", "Effect Audio",
    "Empire Ears", "Final Audio", "FLC Technology", "GS Audio", "Hi-Fri Audio", "IO Audio", "JH Audio", "JLab Audio",
    "Kiwi Ears", "Light Harmonic", "Lime Ears", "MEE Audio", "MiM Audio", "NF Audio", "Noble Audio", "NS Audio",
    "Pai Audio", "Periodic Audio", "PMG Audio", "Prisma Audio", "Shozy & Neo", "Simgot Audio", "Spiral Ear", "Status Audio", "Symphonium Audio",
    "Tin HiFi", "Ultimate Ears", "Unique Melody", "Vision Ears", "Xenns Mangird",
)
BRAND_REMAP = {
    "AFUL Acoustics": "AFUL", "DUNU": "Dunu", "SoftEars": "Softears",
    "Simgot Audio": "Simgot", "Xenns Mangird": "XENNS", "ThieAudio": "Thieaudio",
    "TANGZU": "Tangzu", "LETSHUOER": "Letshuoer",
}


def slug(brand: str, model: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{brand} {model}".lower()).strip("-")


def identity(name: str, known: dict[str, dict[str, str]]) -> tuple[str, str]:
    for prefix in sorted(BRANDS, key=len, reverse=True):
        if name.lower().startswith(prefix.lower() + " "):
            brand, model = prefix, name[len(prefix) + 1:]
            break
    else:
        brand, _, model = name.partition(" ")
    brand = BRAND_REMAP.get(brand, brand)
    if brand == "XENNS" and model.startswith("Mangird "):
        pass  # Mangird remains part of the marketed model name.
    existing = known.get(slug(brand, model))
    if existing:
        return existing["brand"], existing["model"]
    return brand, model


def main() -> None:
    index = list(csv.DictReader((SOURCE / "name_index.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in index:
        if row["form"] == "in-ear" and row["name"]:
            groups[row["name"]].append(row)
    known_rows = json.loads((OUT / "phase2b-catalogue-identities-before.json").read_text(encoding="utf-8"))
    known = {row["slug"]: row for row in known_rows}
    coverage = list(csv.DictReader((ROOT / "data/iem/market/coverage.csv").open(encoding="utf-8")))
    priority_names = {re.sub(r"[^a-z0-9]+", "", (r["brand"] + r["model"]).lower()) for r in coverage}
    ordered = sorted(groups, key=lambda name: (re.sub(r"[^a-z0-9]+", "", name.lower()) not in priority_names, name))
    rows, skipped = [], []
    seen_slugs: dict[str, str] = {}
    for name in ordered:
        if "(" in name or ")" in name:
            skipped.append({"name": name, "reason": "measurement condition or edition in parentheses; defer variant review"})
            continue
        rigs = {r["rig"] for r in groups[name]}
        if len(rigs) != 1 or next(iter(rigs)) not in {"711", "KB006x + 711"}:
            skipped.append({"name": name, "reason": f"ambiguous or undocumented rig {sorted(rigs)}"})
            continue
        brand, model = identity(name, known)
        if not model or model == brand:
            skipped.append({"name": name, "reason": "brand/model cannot be split"})
            continue
        resolved_slug = slug(brand, model)
        if resolved_slug in seen_slugs and seen_slugs[resolved_slug] != name:
            skipped.append({"name": name, "reason": f"slug collides with {seen_slugs[resolved_slug]}; manual identity review"})
            continue
        seen_slugs[resolved_slug] = name
        file = SOURCE / "data/in-ear" / f"{name}.csv"
        if not file.is_file():
            skipped.append({"name": name, "reason": "pinned AutoEq CSV missing"})
            continue
        try:
            points = [[float(r[0]), float(r[1])] for r in csv.reader(file.open(encoding="utf-8-sig")) if len(r) >= 2 and r[0] != "frequency"]
        except (ValueError, OSError) as exc:
            skipped.append({"name": name, "reason": f"invalid numeric CSV: {exc}"})
            continue
        levels = [p[1] for p in points]
        freqs = [p[0] for p in points]
        if (len(points) < 20 or freqs[0] > 100 or freqs[-1] < 10000
                or any(not math.isfinite(v) for p in points for v in p)
                or any(b <= a for a, b in zip(freqs, freqs[1:]))
                or max(levels) - min(levels) > 80):
            skipped.append({"name": name, "reason": "fails existing frequency/level validation; no data repaired"})
            continue
        relative = f"measurements/Super Review/data/in-ear/{name}.csv"
        url = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{PIN}/{urllib.parse.quote(relative)}"
        rows.append({"brand": brand, "model": model, "source": "Super Review (via AutoEq)",
                     "source_url": url, "rig": next(iter(rigs)), "rig_family": "iec60318-4-clone",
                     "form": "in-ear", "variant": None,
                     "source_ref": f"AutoEq@{PIN}:{relative}",
                     "retrieved_at": datetime.now(UTC).isoformat(),
                     "license": "Super Review measurement redistributed by AutoEq; underlying numerical reuse rights unconfirmed.",
                     "notes": f"AutoEq name_index.tsv label: {name}. Original graph URL: {groups[name][0]['url']}. CSV channel composition unspecified.",
                     "points": points})
    with (OUT / "phase2b-superreview-plain.jsonl").open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (OUT / "phase2b-superreview-plain-skipped.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")
    print({"source_unique_names": len(groups), "normalized": len(rows), "deferred_or_invalid": len(skipped),
           "known_slug_matches": sum(slug(r["brand"], r["model"]) in known for r in rows)})


if __name__ == "__main__":
    main()
