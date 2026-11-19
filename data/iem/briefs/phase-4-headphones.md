# Phase 4 — over-ear and on-ear headphones, with photographs

**Owner decision, 2026-11-15:** AURALS should know headphones as well as in-ears:
listeners pick them as the device they are wearing, and the upcoming Store page
shows them. Licensing is not a concern for this development build.

## 1. Measurements

Ingest over-ear and on-ear headphone frequency-response measurements from the pinned
AutoEq checkout you already use (`data/iem/raw/autoeq-*`), using the same
normalise → dry run → import path as the in-ear batches. Sources to use, best first:
oratory1990 over-ear (GRAS 43AG), RTINGS over-ear (HMS II.3), Innerfidelity
(legacy), Headphone.com Legacy, Super Review over-ear, and any other documented
over-ear directory in the pin.

Rules that keep the in-ear ranking untouched:

- Store headphones in the existing catalogue tables (`iems`, `fr_measurements`),
  with `fr_measurements.form` set to `over-ear` or `on-ear`.
- Give every headphone measurement a `rig_family` that starts with `headphone:`,
  e.g. `headphone:gras-43ag`, `headphone:hms-ii-3`. Never use `iec60318-4` or
  `iec60318-4-clone` for a headphone, so no headphone can enter the in-ear ranking.
- Keep exact source, rig, `source_ref` (pinned path) and the original graph URL,
  exactly as the in-ear batches do. Rights: mark unconfirmed.
- Existing rows must not change. Take a catalogue-only backup before each DB write
  and run the fixed-ID four-profile ranking comparison after each batch: all ranked
  in-ear items, scores and order must be identical before and after.

## 2. Photographs

Then get a photograph for every headphone, popular models first. Popular in India
first: Sony WH-1000XM4/XM5/XM6, WH-CH520/CH720N, ULT Wear; Bose QuietComfort 45/Ultra;
Sennheiser Momentum 4, HD 450BT, HD 560S, HD 599, HD 600/650/660S2, HD 800S;
Audio-Technica ATH-M20x/M40x/M50x/M50xBT2; AKG K371/K361/K702/K240; Beyerdynamic DT 770/880/990
Pro; Apple AirPods Max; Marshall Major/Monitor; JBL Tune/Live; boAt Rockerz/Nirvana;
Skullcandy; HyperX Cloud; Logitech G Pro; Philips SHP9500/9600; Hifiman HE400se/Sundara/
Edition XS/Ananda; Focal; Koss Porta Pro/KPH30i; Grado SR80x/SR325x.

Any real photograph of the exact model is fine (retailer, marketplace, review site,
lifestyle shot). Prefer a clean product shot when one exists. The exact-model rule
still holds: a sibling, a different generation or a different colour named as a
different model is a rejection. Check every primary visually on contact sheets.
Import with `auralis import-iem-library` as before.

## Working alongside others

Two other Codex runs are working at the same time:

- **Phase 3** (in-ear photographs) writes `data/iem/images/phase3/*` and
  `data/iem/reports/08-phase-3-images.md`. Do not touch those.
- **Phase 5** (Indian retail links) writes `data/iem/market/india/*`.

Prefix your batches `hp-` and keep your files under `data/iem/images/phase4/` and
`data/iem/raw/` subfolders of your own.

**Do not edit anything under `web/`, and do not edit `backend/src/auralis/`** except
`iem/library.py`, `iem/batch.py` and `iem/importer.py`, additively, if the import
path truly needs it. Put scripts in `tools/iem-ingest/`. No schema migrations.

Storage rules as before: everything inside `G:\Auralis`, no deletions, no overwrites
without a backup, stop and report if G: drops below 5 GB free.

## Reporting

Append to `data/iem/reports/09-phase-4-headphones.md` after every batch: headphones
added (per source and rig family), photographs added, rejections and why, and the
ranking comparison result. End with a summary.
