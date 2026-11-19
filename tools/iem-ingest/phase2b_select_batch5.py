"""Select manually read exact-model listings from unresolved cached feed leads."""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[2] / "data/iem/processed"
leads = json.loads((root / "phase2b-final-image-leads.json").read_text(encoding="utf-8"))
selected = {
    "shure-se215", "sennheiser-momentum-true-wireless-3", "simgot-ew300",
    "moondrop-kato", "dunu-titan-s", "tanchjim-tanya", "7hz-legato",
    "7hz-sonus", "7hz-timeless-ii", "aful-cantor", "apevoix-grit",
    "bgvp-dm9", "bgvp-melody", "bgvp-ns9", "blon-bl-max",
    "colorfly-silver-reference", "debauche-bacchus-monroe", "dunu-zen-pro",
    "effect-audio-axiom", "fiio-fh5s", "hidizs-mp143", "hidizs-ms3",
    "hisenior-mega-5-est-bass", "ice-lab-spectrumica", "kefine-klanar",
    "kefine-klean", "moondrop-concerto", "moondrop-golden-ages",
    "moondrop-jiu", "nf-audio-na2", "nf-audio-ra15", "shure-se425",
    "shuoer-s12-2024", "simgot-ea1000", "simgot-ew200", "simgot-et142",
    "sivga-nightingale", "sony-linkbuds-s", "tanchjim-bunny",
    "tanchjim-echo", "tanchjim-ola", "tanchjim-origin", "tanchjim-zero",
    "tin-hifi-dudu", "tin-hifi-t2-dlc-2022", "tin-hifi-t2-mkii",
    "trn-kirin", "ziigaat-cinno",
}
output = []
for row in leads:
    if row["slug"] not in selected:
        continue
    choice = row["choices"][0]
    output.append({"slug": row["slug"], "source": choice["source"],
                   "title": choice["title"], "handle": choice["handle"],
                   "reason": "Manually reviewed exact model wording in cached public product feed; image identity still requires contact-sheet review."})
if {r["slug"] for r in output} != selected:
    raise ValueError(f"missing leads: {selected - {r['slug'] for r in output}}")
with (root / "phase2-image-batch5-selection.json").open("x", encoding="utf-8") as handle:
    json.dump(output, handle, ensure_ascii=False, indent=2)
print({"selected": len(output)})
