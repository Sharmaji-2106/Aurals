# IEM intake pipeline

Work from `G:/Auralis`. Keep `UV_CACHE_DIR`, `PIP_CACHE_DIR`, `TMP`, `TEMP`,
`PLAYWRIGHT_BROWSERS_PATH` and other tool caches inside `G:/Auralis/.cache`.
`uv.lock` pins the isolated core tooling. Benchmark-only Scrapy, Scrapling,
`lxml` and gallery-dl were installed into this isolated environment; they are
not backend dependencies. Never use search-result crawlers for this project.

`sources.json` records the currently tested adapters, rig policy and terms.
All successful and blocked HTTP bodies are cached under `data/iem/raw/`, with
source URL/status metadata. The fetcher checks robots, sends an honest user
agent, waits two seconds per host and does not bypass challenges. If a network
run fails after some fetches, run it again: those responses come from cache.
Completed output files refuse overwrite. Copy an original to
`data/iem/backups/` before intentionally revising it. Execution status is
appended to `logs/ingestion/intake.jsonl`.

```powershell
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/intake.py catalogue
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/intake.py measurements
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/intake.py images
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/intake.py validate
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/image_rebenchmark.py
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/coverage.py
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/report.py
```

The pilot adapter selection is in `intake.py` and `image-pilot-slugs.json`.
Inspect normalized JSONL/CSV and the image contact sheet before approval.
`approve.py`, `finalize_library.py` and `publish_cutout.py` capture this pilot's
manual approval choices; add a new approval file for the next batch. Product
identity is verified visually against the source page. Heuristic metrics and
filenames never grant approval. Original bytes are retained, and a display
matte is recorded as derived from its original. Unmeasured models stay in
`data/iem/processed/pilot-staging.csv` rather than `iems`.

Take a catalogue-only `pg_dump` before the first database write. Then, from
`backend/`, run the new importers with `uv run --no-sync auralis`:

```powershell
uv run --no-sync auralis import-iem-batch ../data/iem/processed/measurements-pilot.jsonl --dry-run
uv run --no-sync auralis import-iem-batch ../data/iem/processed/measurements-pilot.jsonl
uv run --no-sync auralis import-catalog ../data/iem/processed/catalogue-pilot.csv --dry-run
uv run --no-sync auralis import-catalog ../data/iem/processed/catalogue-pilot.csv
uv run --no-sync auralis import-iem-library ../data/iem/processed/library-pilot-approved.jsonl --dry-run
uv run --no-sync auralis import-iem-library ../data/iem/processed/library-pilot-approved.jsonl
```

The new importers are repeat-safe and keep provenance, raw measurements and
library originals. The measurement importer blocks a second IEC-family curve
on an existing IEC-family IEM so the current recommendation selection cannot
change. Clone curves receive a raw `fr/2` profile but no IEC Harman target
profile. Run `snapshot.py` before and after each new import batch and compare
the full output with `report.py` before accepting the batch.

## Phase 2B bulk runs

The pinned AutoEq revision is `7ae0f56d53074872b028649617a22bbb4232feb7`.
The sparse checkout is `data/iem/raw/autoeq-sparse-phase2b`. Super Review,
Rtings and Hi End Portable numeric in-ear CSVs were normalized in bulk. The
pinned crinacle tree has a name index but no raw numeric FR files. Do not derive
curves from EQ presets or plots. Non-IEC curves retain exact source and rig in
unranked rig families, with only a raw `fr/2` profile.

From the repository root, run `phase2b_bulk_superreview.py`,
`phase2b_bulk_superreview_variants.py`, and `phase2b_bulk_other.py rtings|hiend`.
Inspect JSONL and skipped-name records. Before the first DB write, take a
catalogue-only pg_dump under `data/iem/backups/`. Save a four-profile ranking
snapshot before each measurement batch. From `backend/`, dry-run and then run
`uv run --no-sync auralis import-iem-batch <manifest>`. Save a fixed-ID snapshot
with `phase2b_snapshot_fixed.py <new-name> <prior-name>` and compare every
pre-existing slug, score, source_ref and order. The progress report names the
actual manifests and snapshots.

Images: `phase2b_image_match.py` matches cached public product feeds to DB
identities; select exact product listings into `phase2-image-batchN-selection.json`.
`phase2_images.py N` fetches original CDN bytes with robots/cache/rate limits.
`phase2_contact.py N` builds source contact sheets for manual identity approval
in `phase2-image-batchN-decisions.json`. `phase2_stage_library.py N` checks pHash
and stages original bytes; `phase2b_contact30.py N` builds final primary sheets.
`phase2_mattes.py N` creates dark/light trials, followed by manual decisions in
`phase2-batchN-matte-decisions.json`. `phase2_publish_mattes.py N` retains
originals and records accepted derivatives after checking the opaque RGB core.
Dry-run and then run `auralis import-iem-library` on the final JSONL, followed
by `phase2_index.py N` to mirror verified primaries to the app's index.

The per-model gap ledger is `data/iem/reports/phase2b-image-status.csv`; generate
it with `phase2b_final_audit.py` from `backend/`. Back up its existing outputs
before regenerating after another batch. Every image primary requires a manual
contact-sheet decision; title and CV scores alone never approve a product.
