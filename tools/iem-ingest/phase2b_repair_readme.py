"""Replace a malformed Phase 2B README append after preserving its original."""

from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = root / "tools/iem-ingest/README.md"
text = target.read_text(encoding="utf-8")
head = text.split("## Phase 2B bulk runs", 1)[0]
section = """## Phase 2B bulk runs

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
"""
target.write_text(head + section, encoding="utf-8")
