"""Audit newly imported compound maker names without editing preserved IEM rows."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
before = {r["slug"] for r in json.loads((DATA / "phase2b-catalogue-identities-before.json").read_text(encoding="utf-8"))}
after = json.loads((DATA / "phase2b-catalogue-identities-after-hiend.json").read_text(encoding="utf-8"))
rows = []
for item in after:
    if item["slug"] in before:
        continue
    model = item["model"]
    if not model.startswith(("Audio ", "& ", "Ears ", "Acoustics ")):
        continue
    if model.startswith("& "):
        combined = " & ".join((item["brand"], model[2:].split(" ", 1)[0]))
        proposed_model = model[2:].split(" ", 1)[1] if " " in model[2:] else ""
    else:
        prefix, _, proposed_model = model.partition(" ")
        combined = item["brand"] + " " + prefix
    rows.append({"slug": item["slug"], "stored_brand": item["brand"],
                 "stored_model": item["model"], "proposed_brand_for_review": combined,
                 "proposed_model_for_review": proposed_model,
                 "status": "identity split, not altered; owner/lead review required"})
path = ROOT / "data/iem/reports/phase2b-compound-brand-identity-audit.csv"
with path.open("x", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print({"new_compound_brand_splits": len(rows), "path": str(path)})
