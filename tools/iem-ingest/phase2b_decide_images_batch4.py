"""Manual identity and quality decisions from all 14 batch 4 source sheets."""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
selection = json.loads((DATA / "phase2-image-batch4-selection.json").read_text(encoding="utf-8"))
candidates = json.loads((DATA / "phase2-image-batch4-candidates.json").read_text(encoding="utf-8"))
grouped = defaultdict(list)
for candidate in candidates:
    if "file" in candidate:
        grouped[candidate["slug"]].append(candidate)

reject = {
    "moondrop-block": "Both frames are chiefly the charging case, with the earphones too small to verify for a useful product card.",
}
second_primary = {"fiio-fh3", "tin-hifi-t1-plus", "64-audio-a12t", "64-audio-u6t", "64-audio-nio"}
alternate = {
    "64-audio-a12t", "sennheiser-ie-80-s", "64-audio-u6t", "64-audio-u12t",
    "64-audio-u4s", "64-audio-nio", "thieaudio-clairvoyance", "tanchjim-oxygen",
    "tanchjim-darling", "64-audio-aspire-1", "64-audio-aspire-2",
    "64-audio-aspire-3", "64-audio-solo", "64-audio-u18t", "7th-acoustics-supernova",
    "bgvp-dm8", "bgvp-dma", "blon-bl-05", "bowers-wilkins-pi7",
    "bowers-wilkins-pi7-s2", "colorfly-quintet", "denon-perl-pro", "dita-audio-mecha",
    "dunu-falcon-ultra", "dunu-sa6-mk2", "empire-ears-legend-evo",
    "empire-ears-valkyrie-mkii", "epz-p50", "fatfreq-scarlet-mini",
    "fatfreq-x-hbb-deuce", "fiio-fa19", "fiio-fh15", "fiio-fx15",
    "hisenior-cano-cristales", "io-audio-sogno", "io-audio-volare",
    "jbl-endurance-peak-3", "kinera-freya", "meze-alba", "moondrop-alice",
    "moondrop-aria-snow-edition", "moondrop-lan", "moondrop-may",
    "moondrop-ssr", "moondrop-stellaris", "openaudio-mercury",
    "oriolus-finschi", "ostry-kc06a", "pula-anvil-114", "qdc-uranus",
    "sennheiser-momentum-sport", "shozy-rouge", "shuoer-d13",
    "shuoer-ej07m", "shuoer-singer", "simgot-ew100p", "softears-studio-2",
    "soncie-meory-sw500h", "sony-inzone-buds", "sony-wf-c700n",
    "symphonium-audio-helios", "symphonium-audio-titan", "symphonium-audio-triton",
    "tanchjim-kara", "tanchjim-one", "tanchjim-prism", "thieaudio-elixir",
    "thieaudio-hype-2", "thieaudio-oracle-mkiii", "tin-hifi-t2-evo",
    "tin-hifi-t5s", "ucotech-re-2", "xenns-top",
}
no_alternate = {
    "64-audio-aspire-4": "Second frame is lifestyle photography; first is a clean pair.",
    "64-audio-u18s": "Second frame chiefly shows packaging and accessories.",
    "qdc-anole-v14": "Second frame shows cable connectors only.",
    "fiio-fh3": "First frame has a Hi-Res award badge; clean second frame selected.",
    "moondrop-chu-2": "Second frame is chiefly packaging and accessories.",
    "moondrop-illumination": "Second frame shows packaging only.",
    "xenns-tea2": "Second frame chiefly shows packaging and accessories.",
}
decisions = {}
for index, item in enumerate(selection):
    slug = item["slug"]
    assert grouped[slug], slug
    if slug in reject:
        decisions[slug] = {"primary": None, "alternates": [], "note": reject[slug]}
        continue
    primary = 2 if slug in second_primary else 1
    assert primary <= len(grouped[slug]), slug
    other = 3 - primary
    extras = [other] if slug in alternate and other <= len(grouped[slug]) else []
    note = (f"Manually reviewed exact model and pictured variant in source contact sheet {index // 7 + 1}; "
            f"product is visible without a watermark, award badge or text overlay in selected frame. "
            f"Retailer listing: {item['title']}.")
    if slug in no_alternate:
        note += " " + no_alternate[slug]
    if slug in {"ibasso-it01x", "jbl-live-pro-2-tws", "moondrop-alice"}:
        note += " Only a smaller source original was available in this cached source."
    decisions[slug] = {"primary": primary, "alternates": extras, "note": note}

assert len(decisions) == len(selection) == 93
assert not (second_primary | alternate | set(no_alternate) | set(reject)) - decisions.keys()
with (DATA / "phase2-image-batch4-decisions.json").open("x", encoding="utf-8") as handle:
    json.dump(decisions, handle, ensure_ascii=False, indent=2)
print({"reviewed": len(decisions), "approved": sum(v["primary"] is not None for v in decisions.values()),
       "rejected": len(reject), "alternates": sum(len(v["alternates"]) for v in decisions.values())})
