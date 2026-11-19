# Phase 6 — every Headphone Zone in-ear under ₹16,000, in the catalogue

**Owner decision, 2026-11-15:** many in-ears an Indian listener can actually buy are
missing from AURALS. Every in-ear Headphone Zone India sells for ₹16,000 or less must
be in the catalogue: with a real measurement wherever one has been published, and
listed without one where none exists. Licensing is not a concern for this development
build; the facts must still be real.

## 1. The list

Headphone Zone is a Shopify store. Its in-ear collection is
`https://www.headphonezone.in/collections/in-ear-monitors/products.json?limit=250&page=N`
(221 products on 2026-11-15; 111 have a variant at ₹16,000 or less, 96 at ₹10,000 or
less). Also check its sitemap (`/sitemap.xml`) and its other in-ear collections
(wired earphones, IEMs under a price, brand collections) for in-ears missing from that
collection. Take every in-ear whose lowest variant price is **₹16,000 or less**. Work
through the ₹10,000-and-under ones first.

For each, record: Headphone Zone title, vendor, handle, product URL, lowest variant
price (INR) and which variant, availability, and the product images.

## 2. Identity

Work out the real brand and model. Headphone Zone titles look like
`Headphone Zone X KZ - EDX Pro` or `Truthear x Crinacle - ZERO:RED`.

- A "Headphone Zone X …" product is a **Headphone Zone collaboration**. Check the
  product page: when it says it is the same as the standard model (a co-branded
  listing), match it to the standard model. When it has its own tuning, or HZ calls
  it an exclusive edition, it is its **own product**, e.g. brand `KZ`, model
  `EDX Pro (Headphone Zone edition)`. Never give a collaboration the measurement of
  the standard model unless the page says they are identical.
- Match against the existing catalogue (`iems`: brand, model, slug) the way earlier
  phases did. Exact model and generation only. Colour variants are the same product.
  Bundles and "with mic" variants are the same product.

## 3. A measurement, wherever one exists

For every in-ear not already in the catalogue *with* a measurement, look for a
published frequency-response measurement of **that exact model**:

- the pinned AutoEq checkout (all sources) first;
- then public squig.link-style databases, which publish raw FR text files
  (`data/phone_book.json` plus `data/<name> L.txt` / `R.txt`). Search widely; there
  are many reviewers' instances (for example Super* Review, Precogvision, Hangout.Audio,
  Timmy, Paul Wasabii, Jaytiss, Cammyfi, Antdroid, Banbeucmas, IEM World and others).
  Record the reviewer, the instance URL and the file.
- Record the rig honestly from each source's own description. A 711 / IEC 60318-4
  clone coupler gets `rig_family = iec60318-4-clone` (the engine converts these into
  the ranking). A B&K 5128 gets `bk-5128`. A genuine IEC 60318-4 (GRAS RA0045/RA0402)
  gets `iec60318-4`. Anything uncertain gets `unknown:<source>`, which is stored but
  never ranked.
- Average L and R when both exist. Keep the raw files under `data/iem/raw/phase6/`.
  Import through the existing measurement path (`auralis import-iem-batch`), with
  source, rig, `source_ref`, original URL, and rights marked unconfirmed.
- Never draw, digitise from an image, or estimate a curve. If no numeric measurement
  exists, there is no measurement.

## 4. Into the catalogue

- **Every** in-ear on the list ends up as a catalogue product.
- Products that still have no measurement go in with `auralis import-products <jsonl>`
  (see `backend/src/auralis/iem/products.py` for the format): brand, model, the
  Headphone Zone rupee price (`price_region` `IN`, `price_source` `Headphone Zone`,
  product URL, date), and the Headphone Zone product photograph as the image.
- Products that already exist, or that got a measurement, get the Headphone Zone rupee
  listing too (same importer, or `auralis import-catalog` with `price_region=IN`).
- Photographs: Headphone Zone's own product images are good. Download them into
  `data/iem-images/originals/<slug>/`, keep originals byte-for-byte, and check them
  visually on contact sheets (exact product, not a box or a lifestyle collage where the
  product is tiny). Products that have no photograph yet get one; for the rest, add
  it as an alternate through `auralis import-iem-library`.
- Back up before every DB write. After each batch, run the fixed-ID four-profile
  ranking comparison. The 203 directly measured items must keep identical scores and
  order. New converted items may now appear among them, which is expected; list them.

## Working alongside others

Three other Codex runs are active: Phase 3 (in-ear photos), Phase 4 (headphones) and
Phase 5 (Indian retail links). Do not touch their files. Keep yours under
`data/iem/raw/phase6/`, `data/iem/images/phase6/`, `data/iem/market/india/phase6/` and
`data/iem-images/originals/<slug>/`. Prefix batches `hz-`.

**Do not edit anything under `web/`.** In `backend/src/auralis/`, you may only change
`iem/batch.py`, `iem/library.py` and `iem/importer.py`, additively, if an import truly
needs it. Put scripts in `tools/iem-ingest/`. No schema migrations. Storage rules as
before: everything stays inside `G:\Auralis`, no deletions, back up before overwriting,
stop if G: drops below 5 GB free. Fetch politely: at most 1 request per second per host.

## Reporting

Append to `data/iem/reports/11-headphone-zone.md` after every batch. Count:
in-ears on the list, matched to an existing product, newly measured (per source and
rig), listed without a measurement, photographs added, and rupee listings added.
End with a table of every in-ear on the list and what happened to it.
