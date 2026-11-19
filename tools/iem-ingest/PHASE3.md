# Phase 3 photograph intake

Run from `G:/Auralis`. The phase brief is `data/iem/briefs/phase-3-images.md`.
This pipeline sources real photographs; it never generates images or runs mattes.

Artifacts live under `data/iem/images/phase3/`; approved originals are copied
byte-for-byte into `data/iem-images/originals/`. Output JSON/JSONL/contact-sheet
files use exclusive creation and refuse overwrite. The publisher backs up the
index, refuses any model with an existing image path/primary, locks catalogue
image writes, dry-runs the existing importer, then commits images only.

Use a new batch label for a resumed run. Preserve previous artifacts. The
baseline snapshot and catalogue dump already exist; do not replace them.

## Acquisition and review

Use the isolated image-tool environment:

```powershell
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_images.py discover NEWLABEL --scope ranked
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_reviews.py match NEWREVIEWLABEL ranked --relaxed
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_images.py download NEWLABEL --choices 2
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_nominees.py NEWLABEL
```

Discovery output is a lead, **never approval**. Manually check the saved primary
contact sheets (30 per sheet), full titles in `*-identity.txt`, model generations,
source listing and physical product. Normalizing punctuation creates false
matches (for example CX 200 versus CX 2.00); metadata and visual identity must
both pass. A live source can also replace an older review with a newer product.

For questionable nominees, inspect all downloaded alternatives:

```powershell
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_nominees.py NEWLABEL slug-one slug-two
```

Write a new `NEWLABEL-decisions.json` only after review. Each entry is keyed by
slug and contains `slug`, `candidate` (an explicit downloaded candidate ID, or
null for rejection), and `note` with the identity/rejection reason and sheets
reviewed. `stage` validates candidate ownership and hashes, retains original
bytes and produces the JSONL accepted by `auralis import-iem-library`:

```powershell
uv run --project tools/iem-ingest --no-sync python tools/iem-ingest/phase3_images.py stage NEWLABEL
```

Every row records source, HTTPS page/image URL, credit, retrieval date, exact
hash, dimensions, byte size, format, review method and unconfirmed rights
(development build only, not for publication). Originals serve as primaries;
there are no derived/matte files in this phase.

## Import and validate

From `backend/`, using its existing environment:

```powershell
uv run --no-sync python ../tools/iem-ingest/phase3_db.py publish NEWLABEL
uv run --no-sync python ../tools/iem-ingest/phase3_db.py audit UNIQUE_AUDIT_LABEL
```

The publisher appends the required batch counts and rejection notes to
`data/iem/reports/08-phase-3-images.md`. If a completed acquisition/review batch
has no approved frames, append a zero-import entry with reasons; skip DB/index
writes. `phase3_final.py` produced the final full ledger, source-attempt log,
idempotency/HTTP/hash audit and ranked-gap table. Its outputs refuse overwrite;
back them up and use fresh output paths before any later finalization.

During this run, other catalogue work added models and measurements concurrently.
`phase3_original_subset.py` decoded the pre-write catalogue dump to a read-only
SQL artifact and recovered original row IDs. It never restores into the database.
`baseline-table-ids.json` lets subsequent audits distinguish additions from any
modification/deletion of original protected data. Finalization uses a read-only,
repeatable-read transaction and labels the original 1,035-model cohort separately
from concurrent additions. The live model total is an explicitly timed snapshot.

`phase3-decode-verification.json` records a second full decode of all 497 approved
files, checking their dimensions and formats. `phase3-final-audit.json` includes
17 successful byte-exact HTTP image checks and 497 idempotent importer duplicates.

## Sources and network behavior

- `phase3_images.py feeds`: additional public retailer/manufacturer feeds.
- `phase3_reviews.py inventory`: public review sitemaps. `match` performs local
  name matching; `--relaxed` increases recall and requires particularly careful
  manual identity review.
- `phase3_eearphone.py catalogue` and `match LABEL ranked|all`: public Japanese
  retailer stock/used listings, using both vendor and title.
- `phase3_raa.py LABEL ranked|all`: exact-name candidates from RAA's saved public
  product inventory. The photo adapter selects only product-photo files, not
  FR plots; no numerical measurements are imported.
- `phase3_ranked_seeds.py`, `phase3_ranked_fallbacks.py` and
  `phase3_bulk_plan.py`: retained discovery/selection records for this run;
  their completed output labels cannot be reused.

Fetching uses ordinary HTTPS with a generic user agent, cached robots/status
metadata, a minimum 0.6-second per-host request gap and five worker threads.
Run one acquisition process at a time so the host limit remains global. It
does not authenticate, solve challenges or bypass paywalls; a host access
refusal is retained and subsequent new network requests are stopped. Bodies
already cached in Phase 2 are reused where available. All downloads and working
files stay inside the workspace. Fetching stops below 5 GiB free.

Do not edit `web/`, schema, migrations, measurements, profiles, ranking inputs or
model identities. The tools in this phase do not edit backend source files.
