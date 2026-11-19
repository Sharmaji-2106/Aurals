# Architecture

Auralis is a modular monolith: one Python package (`auralis`) serving an HTTP API and a
job worker, plus a Next.js web app. There is one PostgreSQL database and no other
infrastructure.

```
browser ──▶ Next.js (web/) ──/api/*──▶ FastAPI (auralis.main)
                                            │
                                            ▼
                                       PostgreSQL ◀── worker processes (auralis worker)
                                                          │
                                                          ├─ yt-dlp (metadata, audio)
                                                          └─ analysis library (NumPy/SciPy/librosa)
```

The web server proxies `/api/*` to FastAPI, so the browser only ever talks to one origin.
Session cookies stay first-party, and the API address never reaches the client.

## Backend modules

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `acoustics` | Canonical bands (`bands.py`) and FR processing (`fr.py`). The shared vocabulary. | — |
| `analysis` | Pure audio analysis: decode → features → descriptors → curation → aggregate | `acoustics` |
| `music` | YouTube URLs, yt-dlp access, track selection, job handlers, HTTP routes | `analysis`, `jobs` |
| `jobs` | PostgreSQL job queue, handler registry, worker processes | `db` |
| `questionnaire` | Question definitions, validation, stored responses | — |
| `sound_profile` | Fusion of music, answers and feedback into the personal profile | `analysis` (schema) |
| `iem` | IEM catalogue, raw FR measurements with provenance, derived acoustic profiles | `acoustics` |
| `recommend` | Recommender protocol and the content-based baseline | `acoustics`, `sound_profile` |
| `auth`, `profiles` | Anonymous sessions, the listener profile, account deletion | — |

`analysis` and `acoustics` never import the database or HTTP layers, so they can be
tested, benchmarked and replaced in isolation.

## The music pipeline

A submission is one "add music" request. The work runs as three kinds of job:

1. **`music.ingest`** resolves every source concurrently (yt-dlp metadata only). It then
   selects tracks: it drops repeats, sets aside unavailable, too short, too long and
   altered uploads, merges re-uploads of the same song by title, and samples large
   playlists evenly. It upserts `tracks`, creates `submission_tracks`, and reuses cached
   analyses. For anything uncached it enqueues `music.analyze_track`.
2. **`music.analyze_track`** (one per track, shared by all users) downloads the best
   audio stream into a temporary directory, decodes it, extracts features, stores them
   in `track_analyses` and deletes the audio. Permanent failures (private, silent,
   age-restricted…) are cached. Transient ones retry with backoff.
3. **`music.build_profile`** runs once no track in the submission is pending. It curates
   and aggregates the user's whole library into an immutable `music_profiles` row, then
   rebuilds the sound profile.

Each state change is committed on its own, so the UI (which polls every 1.5 s) shows real
progress. Network and CPU work never happens inside a database transaction.

### Job queue

`jobs` is a table. Workers claim jobs with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
LOCKED)`. A partial unique index on `dedupe_key` for queued or running jobs guarantees
at most one live analysis per track and one build per submission. Workers send
heartbeats. Stale running jobs are requeued, or failed once their attempts are exhausted,
and an `on_exhausted` hook keeps domain state consistent.

## Analysis layers

| Layer | Output | Nature |
| --- | --- | --- |
| `features.py` | `TrackFeatures`: band levels (power per octave vs 500 Hz–2 kHz), 1/6-octave spectrum, BS.1770 loudness, LRA, peak, side/mid ratio, centroid, roll-off, flatness, tempo, onset rate, percussive ratio, MFCC stats, effective bandwidth | measured |
| `descriptors.py` | band emphasis plus brightness, warmth, energy, dynamics, density and width, each 0–1 | heuristic, calibrated |
| `curation.py` | weights, duplicates, outliers, clusters | robust statistics, k-means |
| `aggregate.py` | `MusicProfileData`: weighted medians and IQRs, confidence, clusters, map, notes | summary |

Descriptors are logistic transforms of robust z-scores against the calibration corpus
(`analysis/calibration.json`, built by `auralis calibrate`). A value of 0.5 means "typical
for the corpus". The corpus is small and hand-picked, and the product says so.

Confidence per dimension combines the effective sample size, the spread across tracks
and, for the top bands, the share of tracks whose codec kept content that high.

## Personal sound profile

`sound_profile/fusion.py` (`sound-profile/3`) is a Gaussian Bayesian model per
dimension, in dB relative to the Harman in-ear 2019 target for the tonal dimensions:
a population prior (Harman research), the music as a conditional prior through one
hypothesis parameter ρ (library balance vs preferred balance) with the library's
bootstrap standard error, and answers as noisy observations with a single-item
reliability r. Every numeric assumption lives in `sound_profile/assumptions.py` with its
status and source, and travels with each profile (`assumptions`). Details and
derivations: [phase2/methodology.md](phase2/methodology.md).

Outputs keep the Phase 1.5 shape: per dimension a 0–1 value (now the estimated
population percentile), posterior mean and SD, what music and answers alone suggest,
and `basis` in words; a preference curve with an 80 % range; the same curve from each
source alone (`layers`). Older profiles are rebuilt on read, from stored evidence.

## IEM layer and recommendations

- `iem/datasets.py` imports Harman targets and oratory1990's in-ear measurements from
  AutoEq at a pinned commit into a git-ignored cache, then into the database with rig,
  rig family, configuration, licence note and the exact source path
  (`auralis import-autoeq`). `iem/catalog.py` adds prices and specs from CSV, refusing
  any fact without a source and date (`auralis import-catalog`).
- `fr_targets` stores targets like measurements: raw points, provenance, rig family.
- `acoustics/fr.py` (`fr/2`) validates, grids (1/48 octave, NaN outside the data),
  normalises at 500 Hz, computes the error against a rig-matched target, band features
  with IEC 60318-4 validity weights, and the Olive et al. in-ear statistics.
- `recommend/harman.py` (`harman-personal/1`) ranks candidates by the Olive model's
  expected rating against the listener's personal target over posterior draws, applies
  rig and budget constraints, and explains each result from computed region errors.
  `recommend/band_rms.py` implements the same `Recommender` protocol for comparison.
- `GET /api/recommendations` serves ranked matches with reasons, the measurement's
  provenance, and the reference target used.
- `evaluation/` (`auralis evaluate`) writes [phase2/evaluation.md](phase2/evaluation.md).

Subjective review data has its own module and tables. It is never merged into
measurements, and it never reaches the ranking.

## Community research

- `research/` runs `research.community`, a job that ranks the catalogue once, snapshots
  that ranking for continuity, then searches Reddit for the top few earphones and reads
  the threads it finds. Retrieval is two-phase because the provider's search returns
  posts without their replies.
- `research/provider.py` is the interface. `providers/null.py` is the default and
  retrieves nothing; `providers/reddrix_provider.py` is a scraper and carries the
  reasoning for that on the record (decision 26).
- `research/relevance.py` decides what is actually about the earphone asked for: a
  discussion is kept only when that earphone is the best match in the whole catalogue,
  and a name followed by a generation marker ("Aria 2") is a different product.
- `research/insights.py` labels each verbatim quote with a topic and stance over the
  eight existing themes, recording `tagged_by="llm/<model>"`. It may only discard, never
  add, and never writes text that reaches the screen.
- Evidence lands in `iem_review_sources` / `iem_review_claims` with `kind="reddit"`, so
  `GET /api/iems/{slug}/reviews` serves it unchanged. `AURALIS_REVIEW_SOURCE` decides
  whether scraped sources are published at all.
- `research_events` is an append-only progress log, one committed row per step, polled by
  the discovery sequence. There is no socket and no event stream (decision 27).

## Data model (abridged)

```
users ─┬─ sessions (token hash)
       ├─ profiles (name, currency, budget, experience, gear)
       ├─ music_submissions ─┬─ submission_sources (canonical IDs only)
       │                     └─ submission_tracks ── tracks ── track_analyses (shared cache)
       ├─ music_profiles (immutable JSONB snapshots, versioned)
       ├─ questionnaire_responses (append-only)
       └─ sound_profiles (immutable, references the evidence used)

iems ─┬─ iem_price_observations (dated, sourced)
      └─ fr_measurements (raw points + provenance) ── iem_acoustic_profiles (per processor version)

jobs (queue)
```

Deleting a user cascades to everything they own. Shared track analyses contain no
personal data and are kept.

## Versioning

Every derived artefact records the version of the code that produced it:
`analyzer/1`, `descriptors/1` with calibration `corpus-2026-09`,
`music-profile/2`, `sound-profile/3`, `perceptual/1`, `bands/1`, `fr/2`, `harman-personal/1`. Bump
`ANALYZER_VERSION` when stored feature values would change. Tracks are then re-analysed
on demand, and old profiles remain interpretable.

## Web app

- `src/lib/api`: `openapi-fetch` client typed from FastAPI's OpenAPI schema, plus
  TanStack Query hooks (polling, live previews, cache invalidation).
- Routes: `/` landing, `/start`, `/music`, `/analysis/[id]` (live signal), `/tune`
  (shaping), `/profile` (your sound), `/method`.

### Visual language: one line, many lives

The product tells one story, *music → signal → signature → preference → your sound →
match*, and draws it as the same object throughout: a line on a log-frequency axis
(20 Hz–20 kHz), coloured with the spectral scale (warm lows, cool highs, used only for
audio data). `src/components/signature/stage.tsx` is the shared `SignatureStage` with
composable layers:

| Layer | Used for |
| --- | --- |
| `StageTraces` | many songs (landing illustration, live analysis, profile foundation) |
| `StageLine` (`primary`/`ghost`/`measured`/`white`/`said`) | the protagonist line; an echo; a measured earphone; what the music suggests (solid ink); what the listener said (dashed ember) |
| `StageBand` | spread (middle half of songs) or the range the evidence allows |
| `StageScale` | stated dB marks, so the vertical scale is never implied |
| `StageBands`, `StageFocus` | band columns and the spotlight on a band or frequency range |
| `StageDots`, `StageReference`, `StageAxis` | band points, neutral/midrange line, Hz labels |

`BandRail` is the nine-band vocabulary aligned to the stage (tabs on the landing
explorer, values on the profile), and `Spark` is a single song's spectrum in a list.

Where it appears:

- **Landing**: a canvas field of song spectra that folds into one line on scroll;
  a sticky, scroll-driven chapter stage (illustrative data, labelled); a band explorer
  that spotlights a region and can play band-limited noise on request.
- **Analysis**: each measured song adds its trace; the median and spread are computed
  in the browser from per-song spectra, so the signature visibly forms. Hovering a song
  compares it with the signature.
- **Questionnaire** (a refinement step): every answer is fused server-side without
  saving (`POST /api/sound-profile/preview`). The solid ink line is the music's
  suggestion, the dashed ember line what the answers say, the spectral line the result;
  one sentence says whether the answer confirms, refines or pulls against the music.
- **Profile**: identity sentences (`lib/portrait.ts`), then one large stage with a
  Music / Answers / Combined control: the protagonist line morphs between the three, so
  the refinement is visible (it opens on the music and settles on the combination). Key
  traits and every value carry evidence in words (`lib/evidence.ts`), never percentages.
  "What shaped it" puts the music (foundation) beside the answers (refinement, region by
  region); the per-dimension breakdown sits behind a disclosure.

Motion respects `prefers-reduced-motion`; canvases pause off-screen and in background
tabs.

### Quote labelling

`research/insights.py` chooses a provider (`AURALIS_LLM_PROVIDER`: auto, google,
anthropic, none) and `research/google_llm.py` talks to Google's Generative Language API
over plain `urllib`. Google is tried through a chain — `AURALIS_GOOGLE_MODEL` then
`AURALIS_GOOGLE_FALLBACK_MODELS` — because free-tier availability is per-model and models
are retired without notice. A busy, missing or unreadable model costs one attempt; a
rejected request stops the chain. Without any key a run stores its sources unlabelled and
records that it could not label, rather than guessing. See decision 31.
