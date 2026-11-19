"""Record manual dark/light matte review for all batch 4 primaries."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data/iem/processed"
REPORTS = ROOT / "data/iem/reports"
trials = json.loads((REPORTS / "phase2-batch4-matte-trials.json").read_text(encoding="utf-8"))
by_slug = {row["slug"]: row for row in trials}
accepted = {
    "final-audio-e500", "sennheiser-ie-80-s", "64-audio-u4s", "64-audio-nio",
    "vision-ears-ve8", "thieaudio-clairvoyance", "tanchjim-darling",
    "tin-hifi-t3-plus", "final-audio-e2000", "64-audio-aspire-1",
    "64-audio-aspire-2", "64-audio-aspire-3", "64-audio-aspire-4",
    "64-audio-u18t", "7th-acoustics-supernova", "bgvp-dma", "blon-bl-05",
    "bowers-wilkins-pi7", "bowers-wilkins-pi7-s2", "dunu-falcon-ultra",
    "empire-ears-legend-evo", "fatfreq-scarlet-mini", "fatfreq-x-hbb-deuce",
    "fiio-fa19", "fiio-fh15", "fiio-fh3", "fiio-fx15", "ibasso-it01x",
    "jbl-endurance-peak-3", "kinera-celest-gumiho", "moondrop-lan",
    "openaudio-mercury", "oriolus-finschi", "ostry-kc06a", "qdc-uranus",
    "shozy-rouge", "shuoer-d13", "shuoer-ej07m", "soncie-meory-sw500h",
    "sony-inzone-buds", "sony-wf-c700n", "symphonium-audio-helios",
    "symphonium-audio-titan", "symphonium-audio-triton", "tanchjim-one",
    "tanchjim-prism", "thieaudio-elixir", "thieaudio-hype-2",
    "thieaudio-oracle-mkiii", "tin-hifi-t2-evo", "tin-hifi-t5s", "xenns-tea2",
}
assert accepted <= by_slug.keys()
assert all(by_slug[slug]["status"] == "trial" for slug in accepted)
rejected = {}
for row in trials:
    slug = row["slug"]
    if slug in accepted:
        continue
    if row["status"] == "non-plain border":
        rejected[slug] = "Non-plain photo background; border matte not applicable. Original retained."
    else:
        rejected[slug] = ("Dark/light manual review found lost pale cable/tip or translucent shell, "
                          "contact shadow, visible halo, or background patch; original retained.")
output = {"accepted": sorted(accepted), "rejected": rejected, "already_transparent": [],
          "verification": "Manually inspected each of 14 batch-4 dark/light sheets; accepted only intact silhouettes without obvious halo or missing cables/tips."}
with (DATA / "phase2-batch4-matte-decisions.json").open("x", encoding="utf-8") as handle:
    json.dump(output, handle, ensure_ascii=False, indent=2)
print({"accepted": len(accepted), "rejected": len(rejected)})
