"""Inspect exact public AutoEq index matches for unmeasured checklist products."""

from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path

from intake import cached_get

ROOT = Path(__file__).resolve().parents[2]
COMMIT = "7ae0f56d53074872b028649617a22bbb4232feb7"
BASE = f"https://raw.githubusercontent.com/jaakkopasanen/AutoEq/{COMMIT}/measurements"
SOURCES = ("Super Review", "crinacle", "Rtings")


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


index = {}
for source in SOURCES:
    url = f"{BASE}/{source.replace(' ', '%20')}/name_index.tsv"
    index[source] = list(csv.DictReader(io.StringIO(cached_get(url).decode("utf-8-sig")), delimiter="\t"))

with (ROOT / "data/iem/market/coverage.csv").open(encoding="utf-8", newline="") as handle:
    checklist = list(csv.DictReader(handle))
leads = []
for item in checklist:
    if item["in_db_already"] != "no" or not item["measurement_availability"]:
        continue
    label = item["brand"] + " " + item["model"]
    for source, rows in index.items():
        for record in rows:
            if record.get("form") == "in-ear" and compact(record.get("name", "")) == compact(label):
                leads.append({"brand": item["brand"], "model": item["model"],
                              "source": source, "source_name": record.get("name"),
                              "rig": record.get("rig"), "form": record.get("form"),
                              "source_url": record.get("url"),
                              "index_url": f"{BASE}/{source.replace(' ', '%20')}/name_index.tsv"})
target = ROOT / "data/iem/processed/phase2-measurement-leads.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(leads, handle, indent=2, ensure_ascii=False)
print({"leads": len(leads), "models": len({(x['brand'], x['model']) for x in leads})})
for record in leads:
    print(record["brand"], record["model"], "|", record["source"], "|", record["source_name"], "|", record["rig"])
