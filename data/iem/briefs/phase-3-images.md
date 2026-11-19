# Phase 3 — a photograph for as many earphones as possible

**Owner decision, 2026-11-15:** every earphone the app can recommend should have a
picture. Coverage now matters more than studio polish. Any kind of real photograph
of the exact product is acceptable: a retailer listing, marketplace listing, review
site photo, lifestyle shot, a photo with a coloured or textured background, a
photo with the case or cable visible, or a manufacturer's page. Studio-white
backgrounds and clean mattes are **not** required in this phase. Skip matte trials
entirely; the app handles any photograph.

Current state (from `data/iem/reports/06-phase-2-progress.md`): 1,035 IEMs and 259
verified primaries. Of the 203 **ranked** models, 47 are approved, 1 is legacy and
**155 have no image**. The per-model ledger is
`data/iem/reports/phase2b-image-status.csv`.

## Order of work

1. **The 155 ranked models without an image come first.** These are what listeners
   actually get recommended. Get each one before moving on.
2. Then every other model without an image, starting with the best-known brands
   (Moondrop, Truthear, Tanchjim, 7Hz, KZ, CCA, Simgot, Kiwi Ears, Letshuoer, Dunu,
   Fiio, Thieaudio, Sennheiser, Shure, Sony, Apple, Samsung, Etymotic, Final, etc.).
3. Do it in bulk. Write scripts that search, download, decode, hash and build contact
   sheets for hundreds of models per run. Do not step through models one at a time.

## Where to look

Search widely, using as many source types as you need:
- the cached Shopify feeds you already have, plus more retailer feeds (Linsoul,
  HiFiGo, Shenzhen Audio, Apos Audio, headphones.com, Drop, Penon, KeepHiFi,
  NiceHCK, Hifi Headphones UK, Bloom Audio and others);
- manufacturer product pages;
- Amazon / AliExpress listing images (the product's own listing);
- review sites such as Audio Science Review, Headfonia, Audioreviews,
  In-Ear Fidelity, Head-Fi review pages, RTINGS and Super Review.

Use ordinary HTTP fetching with a polite rate (≤ 2 requests/second per host) and a
generic user agent. Do not log in anywhere and do not bypass CAPTCHAs or paywalls.

## What still must hold (data integrity, unchanged)

- The photo must show **that exact model**. A sibling, a different generation
  (Aria vs Aria 2, Blessing 2 vs Blessing 3), a different colourway named as a
  different model, or a similar-looking product is a rejection. When the
  identity is unsure, reject it. A missing image is better than a wrong one.
- Reject packaging-only shots, charging-case-only shots, images dominated by text
  or logos or award badges, collages where the product is tiny, and AI renders.
- Visually check every primary on a contact sheet (about 30 per sheet). This check
  is required.
- Record provenance for every file in the existing JSONL format that
  `auralis import-iem-library` accepts: `source_name`, `page_url`, `image_url`
  (https), `credit`, `retrieved_on`, `sha256`, size and format. Set `licence_note`
  to say plainly that rights were not confirmed (development build, not for
  publication).
- Keep originals byte-for-byte. You may also write a resized web copy (long edge
  about 1200 px, webp or jpg) and use it as the primary `file_path`.

## Storage and safety rules (unchanged from Update 1)

- Everything stays inside `G:\Auralis`. Images go under `data/iem-images/`.
  Working files go under `data/iem/images/` and `data/iem/reports/`.
- Do not delete or overwrite existing files. Back up any index or manifest before
  appending to it. Never replace an existing approved primary.
- Do not change measurements, profiles, ranking inputs, migrations or the
  database schema.
- **Do not edit anything under `web/`, and do not edit `backend/src/auralis/`
  outside `backend/src/auralis/iem/library.py` and `batch.py`.** Another engineer
  is changing the app at the same time. Put your scripts under `tools/` or
  `data/iem/`.
- If disk space runs low (below 5 GB free on G:), stop and report.

## Reporting

After every batch, append a short entry to `data/iem/reports/08-phase-3-images.md`
with counts: ranked models covered, total covered, rejected and why. Write it after
each batch so the work survives a stop. Keep console output small. At the end, write
a final summary in the same file listing the ranked models still without an image
and the reason for each.
