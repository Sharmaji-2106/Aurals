# AURALS Update 1 — IEM Database Expansion + Product Image Library

You are the primary engineer on this update. A technical lead (another agent) will
review your work between phases and handle final integration sign-off. You have
real ownership: research, decide, build, run, download, process and test yourself.
Do not hand steps back unless you are blocked.

This is **Phase 1 of 2**. Phase 1 ends with a working, reusable pipeline proven on a
pilot set, a full audit, a market-coverage checklist and a benchmark of image
acquisition methods. Phase 2 (a later prompt) scales it to the whole market.

---

## 0. Ground rules — MANDATORY, read twice

The project root is `G:\Auralis` (you are started in it). It is a Windows 11 machine;
you have Git Bash, PowerShell, Python (miniconda) and `uv`.

**Storage.** Every download, scraped page, dataset, cache, temporary file, model
weight, browser binary, generated asset and output stays inside `G:\Auralis`. The C:
drive has only ~6 GB free and must not be used as a download or cache destination.
Your environment already points caches into `G:\Auralis\.cache\` (`PIP_CACHE_DIR`,
`UV_CACHE_DIR`, `PLAYWRIGHT_BROWSERS_PATH`, `HF_HOME`, `TORCH_HOME`, `XDG_CACHE_HOME`,
`npm_config_cache`, `TMP`/`TEMP`/`TMPDIR`). Keep those set for every subprocess you
start, and set any other tool's cache/temp path into `G:\Auralis\.cache\` explicitly.
If you find something writing to C:, stop it and redirect it.

**Preservation (non-negotiable).**
- Do not delete any existing file or folder. Do not run cleanup commands that remove
  existing files (`rm`, `del`, `Remove-Item`, `git clean`, `git checkout -- .`, etc. on
  existing paths). You may delete only files **you created in this task** and only
  inside your own new output directories.
- Do not overwrite an existing file without first copying the original next to it
  (e.g. `name.orig-<date>.ext`) or into `data/iem/backups/`.
- No destructive database migrations: additive only (new tables, new nullable
  columns). Never drop, truncate, rename or rewrite existing tables/columns/rows.
  Never delete or modify existing `fr_measurements`, `iem_acoustic_profiles`,
  `fr_targets` rows, or existing `iems` identity fields (brand, model, slug).
- Before your first database write, take a backup of the catalogue tables only
  (`iems`, `fr_measurements`, `iem_acoustic_profiles`, `fr_targets`,
  `iem_price_observations`, and the review tables) with `pg_dump` into
  `data/iem/backups/`. Do not dump user/account tables.
- Do not uninstall software or remove dependencies. Prefer isolated environments for
  new heavy tooling (see §4) over changing the app's dependency set.
- Do not move existing project files around.
- If free space on G: drops below 25 GB, or a step would need more than you have,
  STOP and report free space and the space required. Do not free space yourself.
- Do not run `git commit`, `git push`, `git reset`, `git stash` or anything that
  changes git history. The owner commits.

**The running stack.** The dev stack (Postgres from `.devtools/pg`, API, worker, web)
is managed by `python scripts/dev.py up|down|status|logs`. Never kill processes by
command-line pattern (a pattern once matched Postgres's children). Use
`uv run --no-sync` in `backend/` (editing `backend/pyproject.toml` while the worker
runs locks `auralis.exe`). Python one-liners that write files must use
`encoding="utf-8"`. In Git Bash set `MSYS_NO_PATHCONV=1` when passing URL paths.
The web app is at http://localhost:3000, the API behind it at `/api/...` (send the
header `x-auralis-client: web` on non-GET requests).

**Secrets and privacy.** Do not read, print, copy or transmit `.env` files, API keys,
`~/.codex/auth.json`, or `Aurals_Brand_Film/assets/ui_captures/session-state.json`
(it holds a session cookie — never use it). Do not send project data or user data to
any third-party service. You only fetch public web pages and files.

**Being a good citizen on the web.** Fetch publicly accessible pages only. Respect
robots.txt and sites' stated terms; rate-limit per host (≥ 1–2 s between requests,
low concurrency); cache every fetched page under `data/iem/raw/` so nothing is
fetched twice; send a plain, honest user agent (e.g. `AuralsCatalogueBot/1.0
(research prototype)` — do not include personal names or emails). Do not log in, do
not bypass paywalls, CAPTCHAs, Cloudflare challenges or other anti-bot measures, do
not rotate proxies or use stealth/fingerprint-evasion modes. If a source blocks
automated access, record that and move on. Do not scrape search-engine result pages
against their terms; prefer official/public APIs and direct sources (manufacturer
sites, retailer catalogues — e.g. public Shopify `products.json` endpoints, which
expose original CDN image URLs — measurement databases, review publications).

**Data integrity (the owner's standing rules).** Never fabricate IEM measurements,
specs, prices, reviews or images. Never silently replace missing data — store it as
unknown. Label heuristics as heuristics. Keep provenance for every value (source
name, URL, retrieval date, licence/terms note). Distinguish **verified measurements**
from **manufacturer claims** from **subjective descriptions**. Never AI-generate,
upscale-and-present, reconstruct or inpaint a product image; only authentic
photographs of the actual product. If an image or a model match is not confident,
mark it `unverified` — never silently approve it.

---

## 1. What exists (verified by the lead today)

- Backend: FastAPI + SQLAlchemy + Alembic, `backend/src/auralis/`. Catalogue models in
  `backend/src/auralis/iem/models.py`: `Iem` (brand, model, slug, `driver_config`
  JSONB, release_year, availability, specs_source_url/retrieved_on, and one product
  image: `image_path`, `image_source`, `image_source_url`, `image_credit`,
  `image_retrieved_on`), `IemPriceObservation`, `FrMeasurement` (source, rig,
  `rig_family`, channel, form, variant, source_ref, license, raw_points, checksum…),
  `FrTarget`, `IemAcousticProfile` (processed curves, `processor_version`,
  `target_name`).
- Counts today: **203 IEMs, 211 measurements, 422 processed profiles** (`fr/2`, one
  raw + one against `harman-ie-2019` per measurement), **2 product photos**, **0**
  sourced specs, **0** prices. All 211 measurements are `oratory1990 (via AutoEq)`,
  rigs GRAS 43AC / 45BC / 45BC-10 / 43ACB, `rig_family = iec60318-4`, 14 with a
  variant. Verify these yourself and report any difference.
- Importers (CLI `auralis …` in `backend/src/auralis/cli.py`): `import-autoeq`
  (targets + oratory1990 in-ear data from a pinned AutoEq commit,
  `iem/datasets.py`, `iem/importer.py`), `import-fr` (one raw FR CSV with source and
  rig), `import-catalog` (`iem/catalog.py`: sourced prices/specs from CSV; refuses
  unsourced values; **rows must refer to IEMs that already have a measurement**),
  `import-iem-images` (`iem/images.py`: `data/iem-images/index.json` → `iems.image_*`;
  the file is the record; files must live in `data/iem-images/`).
- Images are served by the API at `/api/iem-images/{path}` from `data/iem-images/`.
  The web shows them via `web/src/components/results/product-art.tsx` (`rec.image`)
  on the `/match` product cards (`components/results/recommendations.tsx`,
  `Spotlight`, `Collection`) and the detail view (`components/match/match-detail.tsx`).
  Cards render the image `object-contain` with 12% padding on a dark plinth; a photo
  on a white studio backdrop shows as a white box there. `truthear-nova.webp` is a
  matte of Truthear's photo (backdrop removed by `design/book/cutout.py`, product
  pixels untouched) — see how it looks compared with `moondrop-chu.jpg`.
- The recommender (`backend/src/auralis/recommend/service.py`, `load_candidates`)
  ranks **one measurement per IEM**, filtered by `FrMeasurement.rig_family ==
  target.rig_family` and the `fr/2` processed profile.
- Read `docs/` (especially `docs/phase2/`, `docs/decisions.md`) and
  `data/iem-images/README.md` before designing anything.

## 2. Boundaries of this update

- Do **not** redesign Sound DNA or the recommendation engine; those are later
  updates. Do not change scoring.
- **The ranking of existing models must not change** because of your data. If you add
  a second measurement to an existing IEM, `load_candidates` must still choose the
  same measurement it chooses today — verify by snapshotting, before and after, the
  full ranked output for a few sound profiles (e.g. the sample listener captured in
  `web/src/components/book/sample-match.json`, plus 2–3 existing profiles in the
  dev DB): every pre-existing IEM must keep its score; new IEMs may appear in the
  list. If keeping that true would need an engine change, stop and report instead.
- **Rigs and sources stay identifiable.** Every new measurement keeps its own
  `source` and exact `rig`. Only measurements on a genuine IEC 60318-4 ear simulator
  (GRAS 43AG/43AC/45BC/RA0045/RA0402 class) may get `rig_family = iec60318-4`.
  711 clones, other couplers and unknown rigs get a distinct `rig_family` (e.g.
  `iec60318-4-clone`, `unknown`) so the current engine does not rank them; record
  them anyway. Never average or merge curves from different sources/rigs.
- New models enter `iems` only when they have at least one real measurement
  (the catalogue's existing invariant). Popular models with no obtainable
  measurement still get researched (specs, images, provenance) into a staging
  dataset under `data/iem/processed/` and the coverage report, ready for when a
  measurement exists — but not into the ranked catalogue.
- Measurements must go through the existing processing path so each gets its two
  `fr/2` profiles exactly as the current 211 do. Do not reimplement processing.
- Licences: record the terms of each measurement source and image source. Where terms
  are unknown or restrictive, record that (e.g. "unconfirmed") — product photos are
  copyrighted by their owners; the existing records say permission is unconfirmed.

## 3. Storage layout (created; extend sensibly, don't build parallel trees)

```
data/iem/raw/                  fetched pages, API responses, source dumps (cache)
data/iem/processed/            normalized records (JSONL/CSV), staging for unmeasured models
data/iem/market/               popularity & market-coverage checklist and its sources
data/iem/images/candidates/    every downloaded image candidate, original bytes, by slug
data/iem-images/               the APPROVED library the app serves (existing; index.json is the record)
data/iem/reports/              audit, benchmarks, ingestion and image reports
data/iem/backups/              catalogue-table dumps and originals of anything you modify
logs/ingestion/                run logs
.cache/                        tool caches, browsers, model weights, temp
```

Append (don't rewrite) `.gitignore` entries for `data/iem/raw/`,
`data/iem/images/candidates/`, `data/iem/backups/`, `logs/`, `.cache/`.

## 4. Phase 1 tasks

1. **Audit** (`data/iem/reports/01-audit.md`): verified counts; schema; every
   measurement by source/rig/variant; how variants are modelled; the processing
   pipeline and its version; which tables/fields the engine and the UI depend on;
   image storage and how cards fetch images; gaps (specs, prices, images); risks.

2. **Market coverage checklist** (`data/iem/market/coverage.csv` + `.md`): the IEMs
   people actually buy, discuss and recommend — bestsellers, current hot sellers,
   enthusiast favourites, budget staples, flagships and historically influential
   models, across price tiers ($0–50, 50–150, 150–500, 500–1500, 1500+) and brands
   (Moondrop, Truthear, 7Hz, Kiwi Ears, Tangzu, Simgot, Letshuoer, Tin HiFi, KZ, CCA,
   Salnotes, Thieaudio, Dunu, Fiio, Shure, Sennheiser, Etymotic, Campfire, 64 Audio,
   Unique Melody, Elysian, Softears, Sony, Westone, Final, Kinera, Aful, Hidizs,
   Tripowin, Sennheiser IE series, consumer TWS where measured… — research, don't
   trust this list). Evidence for each from at least one public source (retailer
   bestseller lists, Head-Fi, Reddit wiki/recommendation threads, reviewer rankings
   such as crinacle's or Super* Review's published lists). Columns at least: brand,
   model, variant, price tier, why it matters (with source URLs), in DB already?,
   measurement availability (by source/rig), image status. Prioritise missing models
   by popularity.

3. **Measurement sources survey** (`data/iem/reports/02-measurement-sources.md`):
   which public FR databases exist (AutoEq's other in-ear sources at a pinned commit,
   crinacle's published data, squig.link-style databases, Rtings, In-Ear Fidelity,
   etc.), their rigs, coverage of the checklist, formats, licences/terms. Decide which
   to ingest and how they map to `rig_family`.

4. **Tool benchmark** (`data/iem/reports/03-tool-benchmark.md`): try the candidates
   for page/data extraction (Scrapling, Playwright, Scrapy, Crawl4AI, plain
   httpx + selectolax/lxml, Shopify JSON endpoints…) and for images (gallery-dl,
   icrawler, Scrapy ImagesPipeline, Playwright `srcset`/CDN-original extraction, …).
   Choose by measured results, not reputation.

5. **Image acquisition benchmark — VERY HIGH PRIORITY**
   (`data/iem/reports/04-image-benchmark.md`). On a representative set of ~15 IEMs
   (mix of popular budget/mid/flagship, at least 5 that are already in the DB), try
   several acquisition strategies and compare the actual resulting images: resolution,
   compression artefacts, sharpness, colour, backdrop, watermarks, angle, identity.
   Prefer original high-resolution manufacturer/professional photography (strip CDN
   resize parameters, take the largest `srcset` candidate, product JSON originals).
   Build intelligent ranking (resolution, sharpness/blur metrics, JPEG quality
   estimate, aspect, backdrop cleanliness, watermark/text detection, CLIP or similar
   similarity to verified references) and **visually verify identity yourself** —
   you can view images; use that, plus CV evidence, never filenames alone.
   Deduplicate with perceptual hashing; validate integrity (decode fully),
   dimensions and format. Keep originals byte-for-byte; never degrade them.
   You may change the strategy entirely if something produces better images.

6. **Image library design.** Several images per IEM, one primary for the card. Design
   an **additive** schema (e.g. a new `iem_images` table: iem, file path, role
   primary/alternate, width, height, format, bytes, sha256, perceptual hash, source
   name, page URL, image URL, credit, retrieved date, licence note, verification
   status + method + note, quality score, processing notes) with an Alembic migration
   that only adds. Keep `iems.image_*` as the card's primary so the current UI keeps
   working. For the card, a **display derivative** may be produced from the chosen
   original — e.g. backdrop removed by a matte, size-capped WebP — only if product
   pixels are not altered and the derivative is recorded as derived from the original
   (keep both). Check how it looks on the real `/match` cards in the browser.

7. **The pipeline** — reusable, not a one-off. Recommended shape (change it if you
   find better, and say why): an isolated tooling project (e.g. `tools/iem-ingest/`
   with its own `uv` environment for heavy crawler/CV dependencies) that discovers,
   fetches, extracts, normalizes and validates into `data/iem/processed/` and the
   candidate/approved image folders; and small, dependency-light **importers in the
   backend** (CLI subcommands next to the existing ones, with tests) that load the
   normalized, provenance-carrying records into the database idempotently. Resumable
   runs, per-source adapters, a source registry with terms, structured logs in
   `logs/ingestion/`, dry-run mode, and a report generator.

8. **Pilot** end to end on ~25 checklist models (mostly missing ones, some existing):
   backup → measurements imported and processed → specs/prices with provenance →
   images collected, verified, ranked, primary chosen, display derivatives → DB
   updated → ranking-invariance check passes → images visible on the real `/match`
   cards and detail view (check in a browser; e.g. Playwright screenshots into
   `data/iem/reports/screenshots/`) → backend tests (`uv run --no-sync pytest -q`,
   `ruff`, `mypy`) and web checks (`npx tsc --noEmit`, `npx vitest run`) still pass.

9. **Phase 1 report** (`data/iem/reports/05-phase-1.md`): what you built, what you
   found, benchmark conclusions with example images (paths), pilot results (added /
   updated / duplicate / unresolved / unverified), disk usage, problems, and a
   concrete Phase 2 plan with estimates of coverage you expect to reach.

Work methodically, check your outputs, and fix what you find. Quality over speed;
authenticity over coverage. When Phase 1 is complete, end with a concise summary
pointing to the report files.
