"""Headphone Zone India in-ears at or under Rs 16,000, into the catalogue.

    python tools/iem-ingest/hz_sweep.py

Reads the saved list (`data/iem/market/india/phase6/hz-under16k.json`), the catalogue
match (`hz-match.json`) and the reviewer-database hits (`data/iem/raw/phase6/
hz-squig-hits.json`), then writes:

- `data/iem/raw/phase6/hz-measurements.jsonl` for `auralis import-iem-batch`: one
  measurement per product, from the database that states its rig when one does
  ("clone IEC 711" -> iec60318-4-clone); a database that does not state its rig is
  recorded as `unknown:<host>`, stored and never ranked.
- `data/iem/market/india/phase6/hz-products.jsonl` for `auralis import-products`:
  every product on the list, with its Headphone Zone rupee listing and photograph.

Raw files and photographs are kept byte-for-byte. Polite: one request a second per host.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from auralis.iem.importer import slugify

ROOT = Path(__file__).resolve().parents[2]
MARKET = ROOT / "data" / "iem" / "market" / "india" / "phase6"
RAW = ROOT / "data" / "iem" / "raw" / "phase6"
IMAGES = ROOT / "data" / "iem-images" / "originals"

#: Databases whose own configuration states the rig.
STATED_RIG = {
    "squig.link": ("clone IEC 711 (Super* Review)", "iec60318-4-clone"),
    "kr0mka.squig.link": ("Clone IEC 60318-4 coupler (kr0mka)", "iec60318-4-clone"),
}
PREFERENCE = ["squig.link", "kr0mka.squig.link", "precog.squig.link", "hbb.squig.link",
              "jaytiss.squig.link", "aftersound.squig.link", "tonedeafmonk.squig.link",
              "achoreviews.squig.link", "timmyv.squig.link", "iemworld.squig.link"]

_last: dict[str, float] = {}


def fetch(url: str) -> bytes | None:
    host = urllib.parse.urlparse(url).netloc
    wait = 1.05 - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (aurals-dev catalogue)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except Exception:
        return None


def parse(text: str) -> list[tuple[float, float]]:
    out = []
    for line in text.splitlines():
        parts = re.split(r"[\s,;]+", line.strip())
        if len(parts) < 2:
            continue
        try:
            f, db = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        if f > 0:
            out.append((f, db))
    out.sort()
    dedup: list[tuple[float, float]] = []
    for f, db in out:
        if not dedup or f > dedup[-1][0]:
            dedup.append((f, db))
    return dedup


def channel(host: str, file: str, suffix: str) -> list[tuple[float, float]] | None:
    raw = fetch(f"https://{host}/data/{urllib.parse.quote(file + suffix)}.txt")
    if not raw:
        return None
    target = RAW / host / f"{file}{suffix}.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(raw)
    pts = parse(raw.decode("utf-8", "replace"))
    return pts if len(pts) >= 20 else None


def measurement(host: str, file: str) -> tuple[list[list[float]], str] | None:
    left, right = channel(host, file, " L"), channel(host, file, " R")
    if left and right:
        lf = {round(f, 3): d for f, d in left}
        both = [(f, (d + lf[round(f, 3)]) / 2) for f, d in right if round(f, 3) in lf]
        if len(both) >= 20:
            return [[f, round(d, 3)] for f, d in both], "average of L and R"
    one = left or right or channel(host, file, "")
    if one:
        return [[f, round(d, 3)] for f, d in one], "single channel as published"
    return None


#: Colour and limited editions are the same product as their base model.
EDITION = re.compile(r"\s+(?:edition red|red lion edition|ltd\.? ed\.?|limited edition)$", re.I)


def identity(row: dict) -> tuple[str, str]:
    """Brand and model from a Headphone Zone title: 'Headphone Zone X 7Hz x Crinacle - Diablo'."""
    brand, model = _identity(row)
    return brand, EDITION.sub("", model).strip()


def _identity(row: dict) -> tuple[str, str]:
    left, _, right = re.sub(r"(?i)^headphone zone\s*x\s+", "", row["title"]).partition(" - ")
    vendor = row["vendor"].strip()
    if not right:
        return vendor, left.strip()
    left = left.strip()
    if left.lower() == vendor.lower():
        return vendor, right.strip()
    if left.lower().startswith(vendor.lower() + " "):
        return vendor, f"{left[len(vendor):].strip()} {right.strip()}"
    return left, right.strip()


def main() -> None:
    rows = {r["title"]: r for r in json.loads((MARKET / "hz-under16k.json").read_text(encoding="utf-8"))}
    match = {m["title"]: m for m in json.loads((MARKET / "hz-match.json").read_text(encoding="utf-8"))}
    hits = json.loads((RAW / "hz-squig-hits.json").read_text(encoding="utf-8"))
    # Same products under an older brand name (Letshuoer was Shuoer).
    manual = {"Letshuoer - DX1": "shuoer-dx1", "Letshuoer - S12 PRO": "shuoer-s12-pro"}
    now = datetime.now(UTC).isoformat()
    measurements, products, report = [], [], []
    for title, row in rows.items():
        slug = match[title]["match"] or manual.get(title)
        brand, model = identity(row)
        entry = {"title": title, "brand": brand, "model": model, "existing": slug, "measured_by": None}
        if not slug:
            for host, _, name, files in sorted(hits.get(title, []), key=lambda h: PREFERENCE.index(h[0]) if h[0] in PREFERENCE else 99):
                found = measurement(host, files[0])
                if not found:
                    continue
                points, how = found
                rig, family = STATED_RIG.get(host, (f"not stated by {host}", f"unknown:{host}"))
                measurements.append({
                    "brand": brand, "model": model, "source": f"{host} (squig.link database)",
                    "source_url": f"https://{host}/?share={urllib.parse.quote(files[0])}",
                    "rig": rig, "rig_family": family,
                    "source_ref": f"https://{host}/data/{files[0]}*.txt", "retrieved_at": now,
                    "license": "Published measurement; reuse rights unconfirmed (development build).",
                    "points": points, "form": "in-ear", "notes": f"{name}: {how}",
                })
                entry["measured_by"] = f"{host} ({family})"
                break
        products.append({
            "brand": brand, "model": model, **({"slug": slug} if slug else {}),
            "price": str(int(row["price"])), "currency": "INR", "price_region": "IN",
            "price_source": "Headphone Zone", "price_source_url": row["url"],
            "price_observed_on": row["observed_on"], "_image": row["images"][0] if row["images"] else None,
        })
        report.append(entry)
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "hz-measurements.jsonl").write_text("\n".join(json.dumps(m) for m in measurements), encoding="utf-8")
    # Photographs: Headphone Zone's own product image, kept as downloaded.
    for p in products:
        url = p.pop("_image")
        if not url:
            continue
        slug = p.get("slug") or slugify(p["brand"], p["model"])
        ext = Path(urllib.parse.urlparse(url).path).suffix.lower() or ".jpg"
        target = IMAGES / slug / f"hz-primary{ext}"
        if not target.exists():
            data = fetch(url if url.startswith("http") else "https:" + url)
            if not data:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        p.update({
            "image_file": f"originals/{slug}/{target.name}", "image_source": "Headphone Zone",
            "image_source_url": p["price_source_url"],
            "image_credit": "Headphone Zone product photography", "image_retrieved_on": p["price_observed_on"],
        })
    (MARKET / "hz-products.jsonl").write_text("\n".join(json.dumps(p) for p in products), encoding="utf-8")
    (MARKET / "hz-report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    measured = sum(1 for r in report if r["measured_by"])
    print(f"products {len(products)}; existing {sum(1 for r in report if r['existing'])}; "
          f"new measured {measured}; new unmeasured {sum(1 for r in report if not r['existing'] and not r['measured_by'])}")


if __name__ == "__main__":
    main()
