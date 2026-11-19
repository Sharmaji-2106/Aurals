# Phase 2B — owner decision: bulk expansion (supersedes conflicting parts of phase-2.md)

The owner has decided: **different measurement standards are acceptable — we need
hundreds more IEMs in the database, and an image for each one.** Bulk ingestion, now.
Everything in the Phase 1 ground rules still holds (storage in `G:\Auralis`, no
deletion, backups, additive only, polite crawling with no anti-bot circumvention, no
fabrication, authentic images only, provenance on everything, 25 GB stop rule).

## Measurements — bulk

- Ingest **every in-ear (IEM and in-ear wireless) model you can identity-resolve** from
  the pinned AutoEq repository's other sources, in this priority order:
  1. crinacle — 711 rows (rig family `iec60318-4-clone`) and Brüel & Kjær 4620 rows
     (their own family, e.g. `bk-4620` / IEC 60318-7, as you documented);
  2. Super Review — 711 / KB006x + 711 rows (`iec60318-4-clone`);
  3. any other AutoEq in-ear source whose rig you can document; unknown rigs get
     `unknown`. Skip over-ear/on-ear headphones.
- Target: **several hundred new IEM models at minimum** — ideally every resolvable
  in-ear model in those indexes. Checklist/popular models first, then everything else.
- **Every source and rig stays identifiable**: one `fr_measurements` row per source
  curve with its exact `source`, `rig`, `rig_family`, `source_ref`, variant, channel and
  terms note. Never average or merge curves across sources or rigs.
- **Identity**: the same product from two sources is one `iems` row with two
  measurements. Measurement conditions (tips, switches, filters, modules) are
  `variant`s, not new models; different generations/editions (MkII, 2023, Pro) are
  different models. Use the existing brand normalization (`iem/datasets.py`,
  `MULTI_WORD_BRANDS`) and extend it additively. Log every ambiguous merge/split
  decision; when unsure, keep them separate and flag.
- These go through the existing processing path (raw `fr/2` profile). Do **not** apply
  the IEC Harman target to non-IEC rigs and do not change the engine: they stay
  unranked until the separate engine update decides how to compare standards. The
  ranking-invariance check must still pass after every batch (it will, since the
  engine filters by rig family — prove it anyway).
- Check that nothing in the app breaks or slows down with ~1,000+ rows in `iems`
  (any endpoint or page that lists or searches IEMs, the research pages, the
  recommender's query). Fix additively if something does.

## Images — one for each

- Goal: an approved primary photo for **every IEM in `iems`**, old and new. Bulk
  download from all the public catalogue feeds you already cached and any more you
  find (manufacturer stores and media pages, other public Shopify/WooCommerce
  retailers), parallel across hosts but rate-limited per host.
- Scale the review, don't drop it: strict automatic matching (exact model tokens,
  product-type filter to exclude cables/tips/cases/accessories, generation check,
  CV similarity), then **visual review of every primary in contact sheets** of ~30
  (save them under `data/iem/reports/contact-sheets/`). Anything not confidently the
  exact model stays `unverified` and is not used on a card.
- Prefer originals ≥ 1200 px; take smaller only when it is the best that exists, and
  record it. Keep alternates (other angles) where good.
- Mattes for card display: do them in bulk with automatic halo/edge checks plus
  visual review sheets. If matting becomes the bottleneck, finish primaries first,
  matte ranked models first, and leave the rest on their originals (recorded).
- Models whose photo cannot be found anywhere public: list them with what was tried.

## Reporting

Keep appending to `06-phase-2-progress.md` per batch. The final report
(`07-final.md`) must give: models added (by source and rig family), measurements
added, duplicates merged, ambiguous/unresolved names, image coverage (approved /
unverified / none) overall and for ranked vs unranked models, resolution
distribution, mattes accepted/rejected, sources and terms, and all checks re-run.
