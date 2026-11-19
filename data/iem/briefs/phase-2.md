# Phase 2 — scale it up (lead review of Phase 1 and decisions)

Good Phase 1. I verified independently: 214 IEMs, the 211 oratory1990 rows unchanged
(checksum aggregate stable), 433 profiles, 9 verified primaries, before/after rankings
identical, migrations additive, backups in place, detail-view image change is fine.
Every Phase 0 ground rule from the Phase 1 brief still applies in full (storage inside
`G:\Auralis`, caches in `.cache`, no deletion of existing files, back up before
modifying, additive migrations only, catalogue backup before DB writes, no git
history changes, polite crawling with no anti-bot circumvention, no secrets, never
fabricate, authentic images only, unverified when unsure). Re-read them.

Phase 1 was careful but small. Phase 2 is **execution at scale**, not another plan.
Work in batches, re-run the ranking-invariance check after every batch that touches
measurements, append progress to `data/iem/reports/06-phase-2-progress.md` as you go
(so a resumed session can continue), and keep going until the targets below are met
or you hit a real blocker.

## Decisions from the lead

1. **Ranked-catalogue growth must come from compatible measurements.**
   a. Compare the AutoEq commit the existing `import-autoeq` path is pinned to with
      the commit you surveyed (`7ae0f56…`) and AutoEq's current default branch. If
      newer commits contain **oratory1990 in-ear measurements** that are not in the
      DB, import them — same source, same GRAS rigs, through the existing importer
      path with a new explicit pin recorded in provenance. Existing rows stay as
      they are; new rows only.
   b. **Brüel & Kjær Type 4620**: establish from the manufacturer's own public
      documentation whether it is an IEC 60318-4 (occluded ear simulator) compliant
      device. If, and only if, that is documented, crinacle's 4620 in-ear curves
      (from the pinned AutoEq repository) may be imported with
      `rig_family = iec60318-4`, keeping `source` = crinacle (via AutoEq) and the
      exact rig. Cite the document in the report.
   c. For any existing IEM that gains a second ranking-eligible measurement,
      `load_candidates` must still select the measurement it selects today. Prove it
      with the full before/after snapshots (all four profiles + every pre-existing
      IEM's score and selected source_ref). New IEMs may appear in rankings; that is
      the point. If invariance would need an engine change, stop and report.
2. **711-clone (and other non-IEC) measurements**: ingest broadly for checklist and
   popular models as unranked records (their own `rig_family`), with exact identity
   and variant review. Making them rankable is a methodology decision for the later
   engine update — do not apply the IEC Harman target to them.
3. **Rights**: measurement data only from the pinned AutoEq repository (do not scrape
   crinacle.com's graph tool or squig.link hosts whose terms forbid it). Record terms
   as "unconfirmed" where unknown. The owner decides rights before any public release;
   list every source and its terms status in the final report.
4. **Images are the headline deliverable.** Target an approved, visually verified
   primary photo for **every IEM in the `iems` table**, ranked (iec60318-4) models
   first, ordered by checklist popularity, then everything else. Several images per
   model where good alternates exist (other angles, the pair, the shell detail).
   - Prefer manufacturer originals, then official/authorised retailers; strip CDN
     resize parameters, take the largest `srcset`/JSON original. Aim ≥ 1200 px on the
     long edge; record when only smaller exists.
   - Expand adapters beyond Linsoul (HiFiGo, Shenzhen Audio, Apos, Headphones.com,
     manufacturer stores and press/media pages, big-brand product pages that allow
     it). Benchmark per source and keep what wins.
   - Every primary must be checked by you visually (contact sheets per batch, saved
     under `data/iem/reports/`) for exact model and variant, watermark/award badges,
     text overlays, blur, crop. CV/perceptual hashes support, never replace, that.
   - **Card presentation**: the cards are dark. For each primary on a plain studio
     backdrop, produce a display derivative with the backdrop matted out (the approach
     in `design/book/cutout.py` — border flood fill, alpha, colour decontamination —
     or a better local segmentation model run on this machine's GPU with weights in
     `.cache`). Product pixels must stay untouched; review each matte on dark and
     light backgrounds and reject halos, missing cables/nozzles/tips, or eaten
     translucent shells. Where no clean matte is possible (clear/translucent shells),
     keep the original as the primary and record why. Do not redesign the UI.
5. **Specs and prices**: continue with sourced values and evidence types
   (manufacturer claim vs retailer claim); blank when unknown. Prices with source URL
   and observation date only.
6. **Checklist**: grow it toward 150–200 evidence-linked models and use it to
   prioritise both measurements and images.

## Targets for this phase

- Every IEM in `iems`: an approved primary image, or a recorded reason why not.
- As many new ranking-eligible measured IEMs as decisions 1a/1b allow, plus unranked
  clone-measured popular models.
- Image library stats: per model counts, resolution distribution, source mix,
  verification status, duplicates rejected (by pHash), mattes accepted/rejected.

## Integration and final checks (end of phase)

- Backend: `uv run --no-sync pytest -q`, `ruff check .`, `mypy`; Alembic upgrade on
  the running DB is additive only.
- Web: `npx tsc --noEmit`, `npx eslint src e2e --max-warnings=0`, `npx vitest run`,
  and `npx playwright test` (4 failures are pre-existing and unrelated: `/match`'s
  heading reads "Your sound hasa signature" in onboarding/research specs — do not fix
  or count them; any other failure is yours to fix).
- The edition at `/book-studio` must still land on the sample `/match` page (its data
  is the snapshot in `web/src/components/book/sample-match.json`; don't change it).
- Live browser screenshots of `/match` cards and detail views with new photos, desktop
  and phone, into `data/iem/reports/screenshots/`.

## Final report — `data/iem/reports/07-final.md`

1. Audit summary (before → after counts).
2. Database expansion: added / updated / duplicate / unresolved models, with reasons;
   ranked vs unranked additions; per-source and per-rig counts.
3. Image library: coverage and validation statistics as above; examples.
4. Tooling: how to run the pipeline (also write `tools/iem-ingest/README.md`).
5. Sources and provenance: every source, what was taken, terms status.
6. Confirmation that existing functionality is intact, with the commands and results.
7. Open questions for the owner (rights, clone-rig ranking, anything unresolved).
