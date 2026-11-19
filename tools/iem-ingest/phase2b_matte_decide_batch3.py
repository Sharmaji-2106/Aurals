"""Recorded dark/light visual decisions for each batch 3 trial matte."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
REPORTS = ROOT / "data/iem/reports"
trials = json.loads((REPORTS / "phase2-batch3-matte-trials.json").read_text(encoding="utf-8"))
accepted = {
    "simgot-em6l", "moondrop-kadenz", "arpegear-hane", "dunu-kima-2",
    "dunu-sa6-est", "hiby-yacht-10", "kefine-delci", "kefine-quatio",
    "kiwi-ears-aether", "kz-x-hbb-pr2", "moondrop-darksaber",
    "moondrop-harmon", "moondrop-quark-2", "moondrop-solis-2",
    "moondrop-starfield-2", "moondrop-ultrasonic", "shuoer-cadenza-12",
    "shuoer-mystic-8", "shuoer-s08", "simgot-ea500lm",
    "simgot-supermix-4", "thieaudio-monarch-mkii", "thieaudio-monarch-mkiii",
    "thieaudio-oracle-mkii", "thieaudio-origin", "tripowin-x-0dibi-vivace",
    "twistura-woodnote", "yanyin-canon-pro", "ziigaat-arcanis", "ziigaat-lush",
}
by_slug = {row["slug"]: row for row in trials}
if not accepted <= by_slug.keys() or any(by_slug[slug]["status"] != "trial" for slug in accepted):
    raise ValueError("accepted matte does not have a saved trial")
rejected = {}
for row in trials:
    slug = row["slug"]
    if slug in accepted:
        continue
    if row["status"] == "non-plain border":
        rejected[slug] = "non-plain background; border-connected studio matte not applicable"
    else:
        rejected[slug] = ("manual dark/light review found pale cable/tip or translucent shell loss, "
                          "contact shadow, reflection, white hole, or halo; source original retained")
output = {"accepted": sorted(accepted), "rejected": rejected, "already_transparent": [],
          "verification": "Manually inspected every phase2-batch3-mattes-sheet-1..9.png on dark navy and light ivory. Accepted only intact product silhouettes without obvious halo or missing tips/nozzles/cables."}
target = DATA / "phase2-batch3-matte-decisions.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(output, handle, ensure_ascii=False, indent=2)
print({"accepted": len(accepted), "rejected": len(rejected)})
