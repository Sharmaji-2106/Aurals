"""Record manual dark/light decisions from all seven batch 5 matte sheets."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
REPORTS = ROOT / "data/iem/reports"
trials = json.loads((REPORTS / "phase2-batch5-matte-trials.json").read_text(encoding="utf-8"))
by_slug = {row["slug"]: row for row in trials}
accepted = {
    "shure-se215", "sennheiser-momentum-true-wireless-3", "dunu-titan-s",
    "tanchjim-tanya", "7hz-timeless-ii", "apevoix-grit", "bgvp-dm9",
    "blon-bl-max", "colorfly-silver-reference", "debauche-bacchus-monroe",
    "fiio-fh5s", "hidizs-mp143", "hidizs-ms3", "kefine-klanar",
    "moondrop-concerto", "moondrop-golden-ages", "moondrop-jiu",
    "nf-audio-ra15", "shuoer-s12-2024", "sony-linkbuds-s",
    "tanchjim-zero", "tin-hifi-dudu", "trn-kirin", "ziigaat-cinno",
}
assert accepted <= by_slug.keys()
assert all(by_slug[slug]["status"] == "trial" for slug in accepted)
rejected = {}
for row in trials:
    slug = row["slug"]
    if slug in accepted:
        continue
    rejected[slug] = ("Non-plain source background; original retained." if row["status"] == "non-plain border"
                      else "Dark/light review found pale cable or tip loss, shell hole, shadow or halo; original retained.")
output = {"accepted": sorted(accepted), "rejected": rejected, "already_transparent": [],
          "verification": "Manually inspected all seven dark/light trial sheets; accepted intact silhouettes only."}
with (DATA / "phase2-batch5-matte-decisions.json").open("x", encoding="utf-8") as handle:
    json.dump(output, handle, ensure_ascii=False, indent=2)
print({"accepted": len(accepted), "rejected": len(rejected)})
