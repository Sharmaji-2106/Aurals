"""Normalize pinned AutoEq in-ear configuration curves after identity review."""

from __future__ import annotations

import csv
import json
import math
import re
import urllib.parse
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from phase2b_bulk_superreview import OUT, PIN, SOURCE, identity, slug

EDITION_SUFFIX = {"2023", "2021", "2019", "pre-2020", "revised", "2"}


def main() -> None:
    index = list(csv.DictReader((SOURCE / "name_index.tsv").open(encoding="utf-8-sig"), delimiter="\t"))
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for entry in index:
        if entry["form"] == "in-ear" and entry["name"] and "(" in entry["name"]:
            groups[entry["name"]].append(entry)
    known = {r["slug"]: r for r in json.loads((OUT / "phase2b-catalogue-identities-before.json").read_text(encoding="utf-8"))}
    rows, skipped = [], []
    for name in sorted(groups):
        match = re.fullmatch(r"(.+?)\s*\(([^()]*)\)", name)
        if match is None:
            skipped.append({"name": name, "reason": "malformed or nested parentheses; manual review"})
            continue
        base, suffix = match.groups()
        edition = suffix.strip().lower() in EDITION_SUFFIX
        if name == "Nothing ear (2)":
            edition = True
        if base == "EarFun Free Pro" and suffix.startswith("Oluv Edition, ANC "):
            base = "EarFun Free Pro (Oluv Edition)"
            suffix = suffix.removeprefix("Oluv Edition, ")
            edition = False
        if edition:
            base, variant = name, None
        else:
            variant = suffix.strip()
        brand, model = identity(base, known)
        if not model or not variant and not edition:
            skipped.append({"name": name, "reason": "identity or condition unresolved"})
            continue
        rigs = {r["rig"] for r in groups[name]}
        if len(rigs) != 1 or next(iter(rigs)) not in {"711", "KB006x + 711"}:
            skipped.append({"name": name, "reason": f"ambiguous or undocumented rig: {sorted(rigs)}"})
            continue
        file = SOURCE / "data/in-ear" / f"{name}.csv"
        if not file.is_file():
            skipped.append({"name": name, "reason": "pinned AutoEq CSV missing"})
            continue
        try:
            points = [[float(r[0]), float(r[1])] for r in csv.reader(file.open(encoding="utf-8-sig")) if len(r) >= 2 and r[0] != "frequency"]
        except (OSError, ValueError) as exc:
            skipped.append({"name": name, "reason": f"invalid numeric CSV: {exc}"})
            continue
        levels, freqs = [p[1] for p in points], [p[0] for p in points]
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
                     "form": "in-ear", "variant": variant,
                     "source_ref": f"AutoEq@{PIN}:{relative}",
                     "retrieved_at": datetime.now(UTC).isoformat(),
                     "license": "Super Review measurement redistributed by AutoEq; underlying numerical reuse rights unconfirmed.",
                     "notes": f"AutoEq name_index.tsv label: {name}. Original graph URL: {groups[name][0]['url']}. CSV channel composition unspecified. {'Edition retained in model identity.' if edition else 'Parenthesized measurement condition retained as variant.'}",
                     "points": points})
    with (OUT / "phase2b-superreview-variants.jsonl").open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (OUT / "phase2b-superreview-variants-skipped.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")
    print({"source_names": len(groups), "normalized": len(rows), "skipped": len(skipped),
           "distinct_product_slugs": len({slug(r['brand'], r['model']) for r in rows})})


if __name__ == "__main__":
    main()
