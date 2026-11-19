"""Normalize further pinned AutoEq in-ear sources with source-specific rig families."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import urllib.parse
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from intake import cached_get
from phase2b_bulk_superreview import OUT, PIN, ROOT, identity, slug
from phase2b_bulk_superreview_variants import EDITION_SUFFIX

SOURCES = {
    "rtings": {"folder": "Rtings", "source": "Rtings (via AutoEq)",
               "families": {"HMS II.3": "hms-ii-3", "Bruel & Kjaer 5128": "bk-5128"},
               "license": "RTINGS measurements redistributed by AutoEq; numerical reuse terms unconfirmed/restrictive; owner rights review required."},
    "hiend": {"folder": "Hi End Portable", "source": "Hi End Portable (via AutoEq)",
              "families": {"711": "iec60318-4-clone"},
              "license": "Hi End Portable measurements redistributed by AutoEq; underlying numerical reuse terms unconfirmed."},
}


def main(key: str, identity_file: str) -> None:
    spec = SOURCES[key]
    base = ROOT / "data/iem/raw/autoeq-sparse-phase2b/measurements" / spec["folder"]
    index_url = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{PIN}/{urllib.parse.quote('measurements/' + spec['folder'] + '/name_index.tsv')}"
    index = list(csv.DictReader(io.StringIO(cached_get(index_url).decode("utf-8-sig")), delimiter="\t"))
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for entry in index:
        if entry["form"] == "in-ear" and entry["name"]:
            groups[entry["name"]].append(entry)
    known = {r["slug"]: r for r in json.loads((OUT / identity_file).read_text(encoding="utf-8"))}
    rows, skipped = [], []
    for name in sorted(groups):
        base_name, variant = name, None
        if "(" in name or ")" in name:
            match = re.fullmatch(r"(.+?)\s*\(([^()]*)\)", name)
            if match is None:
                skipped.append({"name": name, "reason": "malformed/nested measurement condition"})
                continue
            before, suffix = match.groups()
            if suffix.strip().lower() not in EDITION_SUFFIX:
                base_name, variant = before, suffix.strip()
        brand, model = identity(base_name, known)
        if not model:
            skipped.append({"name": name, "reason": "brand/model split unresolved"})
            continue
        rigs = {entry["rig"] for entry in groups[name]}
        if len(rigs) != 1 or next(iter(rigs)) not in spec["families"]:
            skipped.append({"name": name, "reason": f"undocumented or ambiguous rig {sorted(rigs)}"})
            continue
        rig = next(iter(rigs))
        relative = f"measurements/{spec['folder']}/data/in-ear/"
        if key == "rtings":
            relative += f"{rig}/"
        relative += f"{name}.csv"
        file = ROOT / "data/iem/raw/autoeq-sparse-phase2b" / relative
        if not file.is_file():
            skipped.append({"name": name, "reason": f"CSV absent from pinned checkout: {relative}"})
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
        url = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{PIN}/{urllib.parse.quote(relative)}"
        rows.append({"brand": brand, "model": model, "source": spec["source"],
                     "source_url": url, "rig": rig, "rig_family": spec["families"][rig],
                     "form": "in-ear", "variant": variant,
                     "source_ref": f"AutoEq@{PIN}:{relative}",
                     "retrieved_at": datetime.now(UTC).isoformat(), "license": spec["license"],
                     "notes": f"AutoEq name_index.tsv label: {name}. Original graph URL: {groups[name][0]['url']}. CSV channel composition unspecified; non-IEC rig kept unranked.",
                     "points": points})
    output = OUT / f"phase2b-{key}-measurements.jsonl"
    with output.open("x", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (OUT / f"phase2b-{key}-skipped.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=2), encoding="utf-8")
    print({"source": key, "index_unique_names": len(groups), "normalized": len(rows),
           "skipped": len(skipped), "distinct_slugs": len({slug(r['brand'], r['model']) for r in rows})})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=SOURCES)
    parser.add_argument("identity_file")
    args = parser.parse_args()
    main(args.source, args.identity_file)
