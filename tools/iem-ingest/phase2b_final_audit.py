"""Write a per-model image ledger and aggregate catalogue audit from the live DB."""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select

from auralis.db import new_session
from auralis.iem.models import FrMeasurement, Iem, IemAcousticProfile, IemImage, IemPriceObservation

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
REPORTS = ROOT / "data/iem/reports"
ranked = {row["slug"] for row in json.loads((REPORTS / "ranking-phase2-batch2-after.json").read_text(encoding="utf-8"))["sample"]}
leads = {row["slug"]: row for row in json.loads((DATA / "phase2b-final-image-leads.json").read_text(encoding="utf-8"))}
no_lead = {row["slug"] for row in json.loads((DATA / "phase2b-final-image-no-shopify-title-match.json").read_text(encoding="utf-8"))}
rejected = {}
for batch in (2, 3, 4):
    path = DATA / f"phase2-image-batch{batch}-decisions.json"
    if path.exists():
        for slug, decision in json.loads(path.read_text(encoding="utf-8")).items():
            if decision["primary"] is None:
                rejected[slug] = decision["note"]

with new_session() as session:
    iems = session.scalars(select(Iem).order_by(Iem.brand, Iem.model)).all()
    images = session.scalars(select(IemImage)).all()
    measures = session.scalars(select(FrMeasurement)).all()
    profiles = session.scalars(select(IemAcousticProfile)).all()
    prices = session.scalars(select(IemPriceObservation)).all()

primaries = {row.iem_id: row for row in images if row.role == "primary" and row.verification_status == "verified"}
by_iem = defaultdict(list)
for row in images:
    by_iem[row.iem_id].append(row)
ledger = []
for row in iems:
    primary = primaries.get(row.id)
    if primary:
        status, reason = "approved", "Manual source contact-sheet identity review; primary source and verification recorded in iem_images."
    elif row.image_path:
        status, reason = "unverified_legacy", "Legacy image_path exists without a verified iem_images primary; source record requires review."
    elif row.slug in rejected:
        status, reason = "none", rejected[row.slug]
    elif row.slug in leads:
        status, reason = "none", "Cached retailer title lead was ambiguous or not yet visually reviewed; exact model/variant unverified."
    elif row.slug in no_lead:
        status, reason = "none", "No exact product-title match in 12 cached public Shopify feeds; official/retailer image search still needed."
    else:
        status, reason = "none", "No approved photo in current library; product-specific public source not yet resolved."
    ledger.append({"brand": row.brand, "model": row.model, "slug": row.slug,
                   "ranked_current_engine": "yes" if row.slug in ranked else "no",
                   "image_status": status, "library_image_count": len(by_iem[row.id]),
                   "primary_file": primary.file_path if primary else row.image_path or "",
                   "primary_source": primary.source_name if primary else row.image_source or "",
                   "primary_long_edge": max(primary.width, primary.height) if primary else "",
                   "reason": reason})

ledger_path = REPORTS / "phase2b-image-status.csv"
if ledger_path.exists():
    shutil.copyfile(ledger_path, ROOT / "data/iem/backups" / f"phase2b-image-status.before-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.csv")
with ledger_path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(ledger[0]))
    writer.writeheader()
    writer.writerows(ledger)
source_rig = Counter((m.source, m.rig or "unknown", m.rig_family or "unknown") for m in measures)
oratory = sorted((m.source_ref or "", m.checksum) for m in measures if m.source == "oratory1990 (via AutoEq)")
orexdigest = hashlib.sha256(json.dumps(oratory, ensure_ascii=False).encode("utf-8")).hexdigest()
primary_source = Counter(p.source_name for p in primaries.values())
resolution = Counter("<800" if max(p.width, p.height) < 800 else "800-1199" if max(p.width, p.height) < 1200 else "1200-1999" if max(p.width, p.height) < 2000 else "2000+" for p in primaries.values())
status = Counter(x["image_status"] for x in ledger)
rank_status = Counter((x["ranked_current_engine"], x["image_status"]) for x in ledger)
summary = {"iems": len(iems), "measurements": len(measures), "profiles": len(profiles),
           "price_observations": len(prices), "sourced_specs": sum(bool(i.specs_source_url) for i in iems),
           "library_images": len(images), "verified_primaries": len(primaries),
           "image_paths": sum(bool(i.image_path) for i in iems),
           "image_status": dict(status),
           "ranked_image_status": {f"{k[0]}:{k[1]}": v for k, v in rank_status.items()},
           "primary_source": dict(primary_source), "primary_long_edge": dict(resolution),
           "measurement_source_rig": [{"source": source, "rig": rig, "rig_family": family, "count": count}
                                      for (source, rig, family), count in sorted(source_rig.items())],
           "original_oratory_rows": len(oratory), "original_oratory_source_ref_checksum_sha256": orexdigest}
summary_path = REPORTS / "phase2b-final-audit.json"
if summary_path.exists():
    shutil.copyfile(summary_path, ROOT / "data/iem/backups" / f"phase2b-final-audit.before-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}.json")
with summary_path.open("w", encoding="utf-8") as handle:
    json.dump(summary, handle, ensure_ascii=False, indent=2)
print({k: summary[k] for k in ("iems", "measurements", "profiles", "library_images", "verified_primaries", "image_status", "ranked_image_status")})
