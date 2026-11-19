"""Recorded manual decisions after visual review of all nine batch 3 sheets."""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
selection = json.loads((DATA / "phase2-image-batch3-selection.json").read_text(encoding="utf-8"))
candidates = json.loads((DATA / "phase2-image-batch3-candidates.json").read_text(encoding="utf-8"))
grouped = defaultdict(list)
for record in candidates:
    if "file" in record:
        grouped[record["slug"]].append(record)

# These positions were chosen by looking at the nine original contact sheets, not
# by title or image score. All other first frames also passed the visual check.
primary_2 = {
    "dunu-dk3001bd", "kiwi-ears-aether", "kiwi-ears-quartet",
    "kz-ast", "moondrop-illustrious", "moondrop-quark-2",
    "moondrop-solis-2", "shuoer-cadenza-4", "ziigaat-lush",
}
rejected = {
    "softears-volume-s": "Both source frames have a visible Softears text overlay above the product; seek a clean source.",
    "softears-studio-4": "The product-only frame carries a Softears text overlay; second frame is an advertisement with large text.",
}
alternates = {
    "simgot-em6l", "arpegear-hane", "campfire-audio-moon-rover",
    "dunu-glacier", "dunu-kima-2", "dunu-sa6-est", "kefine-delci",
    "kefine-quatio", "kiwi-ears-orchestra", "moondrop-meteor",
    "moondrop-starfield-2", "openaudio-siren", "seeaudio-yume",
    "shuoer-cadenza-12", "shuoer-dx1", "shuoer-mystic-8",
    "simgot-ea500lm", "simgot-supermix-4", "thieaudio-monarch-mkii",
    "thieaudio-monarch-mkiii", "thieaudio-oracle-mkii", "thieaudio-origin",
    "tripowin-x-0dibi-vivace", "xenns-top-pro", "yanyin-canon-ii",
    "yanyin-canon-pro", "ziigaat-arcanis",
}
decisions = {}
for index, item in enumerate(selection):
    slug = item["slug"]
    if slug not in grouped:
        raise ValueError(f"no valid images for {slug}")
    sheet = index // 7 + 1
    if slug in rejected:
        decisions[slug] = {"primary": None, "alternates": [], "note": rejected[slug]}
        continue
    primary = 2 if slug in primary_2 else 1
    if primary > len(grouped[slug]):
        raise ValueError(f"chosen frame unavailable for {slug}")
    alternate = 3 - primary
    approved_alternates = [alternate] if slug in alternates and alternate <= len(grouped[slug]) else []
    note = (f"Manual visual identity/variant review in batch 3 contact sheet {sheet}; "
            f"exact source listing {item['title']}; selected frame shows the product shells "
            "without an award badge, advertisement, packaging-only view, or obvious wrong generation.")
    if slug == "moondrop-droplet":
        note += " Exploded schematic second frame excluded as a non-photograph."
    if slug == "moondrop-ultrasonic":
        note += " Case-only second frame excluded."
    if slug == "kz-zsn-pro":
        note += " Advertisement/text-overlay second frame excluded."
    decisions[slug] = {"primary": primary, "alternates": approved_alternates, "note": note}

target = DATA / "phase2-image-batch3-decisions.json"
with target.open("x", encoding="utf-8") as handle:
    json.dump(decisions, handle, ensure_ascii=False, indent=2)
print({"reviewed": len(decisions), "approved_primaries": sum(x["primary"] is not None for x in decisions.values()),
       "rejected": len(rejected), "selected_alternates": sum(len(x["alternates"]) for x in decisions.values())})
