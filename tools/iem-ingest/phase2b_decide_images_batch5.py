"""Manual decisions after visual inspection of all seven batch 5 source sheets."""

import json
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[2] / "data/iem/processed"
selection = json.loads((root / "phase2-image-batch5-selection.json").read_text(encoding="utf-8"))
candidates = json.loads((root / "phase2-image-batch5-candidates.json").read_text(encoding="utf-8"))
grouped = defaultdict(list)
for image in candidates:
    if "file" in image:
        grouped[image["slug"]].append(image)
reject = {
    "aful-cantor": "First image carries a visible awards badge; second chiefly shows packaging and accessories.",
    "tanchjim-bunny": "Both first frames show only Bunny retail packaging, not an unobstructed product photograph.",
}
second = {"nf-audio-na2", "ice-lab-spectrumica"}
no_alternate = {"shure-se215", "simgot-ew300", "nf-audio-na2", "hidizs-ms3",
                "effect-audio-axiom", "tanchjim-zero", "tin-hifi-t2-dlc-2022",
                "sivga-nightingale"}
decisions = {}
for index, row in enumerate(selection):
    slug = row["slug"]
    assert len(grouped[slug]) == 2, slug
    if slug in reject:
        decisions[slug] = {"primary": None, "alternates": [], "note": reject[slug]}
        continue
    primary = 2 if slug in second else 1
    note = (f"Manual model and pictured variant review in batch 5 source sheet {index // 7 + 1}; "
            f"selected frame shows authentic product without text overlay, award badge or wrong generation. "
            f"Source listing: {row['title']}.")
    if slug in no_alternate:
        note += " Other frame excluded as packaging, accessory layout, advertisement, or lower quality."
    decisions[slug] = {"primary": primary,
                       "alternates": [] if slug in no_alternate else [3 - primary],
                       "note": note}
with (root / "phase2-image-batch5-decisions.json").open("x", encoding="utf-8") as handle:
    json.dump(decisions, handle, ensure_ascii=False, indent=2)
print({"reviewed": len(decisions), "approved": sum(x["primary"] is not None for x in decisions.values()),
       "rejected": len(reject), "alternates": sum(len(x["alternates"]) for x in decisions.values())})
