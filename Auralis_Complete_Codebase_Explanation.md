# Auralis

## Complete Codebase Explanation

**Repository:** `G:\Auralis` · **Inspected:** 2026-09-30 · **Basis:** the source code as it stands today

This report explains the implementation that exists in the repository right now. Every file path, function, endpoint, table and library named here was read or executed during the audit. Where the code does something different from what was originally planned, the implementation is described and the difference is stated. Where a number could not be established from the repository, it is marked **not verified**.

Three phrases are used deliberately throughout:

- **Measured** — a direct, reproducible measurement of real data (audio samples, a published frequency-response measurement).
- **Derived** — computed from measured values by a stated formula.
- **Heuristic / assumption / hypothesis** — a choice the team made that is reasonable but not validated against listener outcomes.

The distinction matters more than anything else in this project, and section 18 is devoted to it.

---

## Contents

1. [What Auralis is](#1-what-auralis-is)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [End-to-end data flow](#4-end-to-end-data-flow)
5. [The audio analysis](#5-the-audio-analysis)
6. [Artificial intelligence and machine learning — what is actually there](#6-artificial-intelligence-and-machine-learning--what-is-actually-there)
7. [The personal sound profile](#7-the-personal-sound-profile)
8. [The earphone side](#8-the-earphone-side)
9. [The recommendation engine](#9-the-recommendation-engine)
10. [The frontend](#10-the-frontend)
11. [Backend and API](#11-backend-and-api)
12. [Database](#12-database)
13. [Complete file map](#13-complete-file-map)
14. [Who does what — the two-minute version](#14-who-does-what--the-two-minute-version)
15. [Security and engineering](#15-security-and-engineering)
16. [Performance](#16-performance)
17. [How the system is validated](#17-how-the-system-is-validated)
18. [Scientific honesty — what Auralis can and cannot claim](#18-scientific-honesty--what-auralis-can-and-cannot-claim)
19. [Viva preparation](#19-viva-preparation)
20. [The project in one page](#20-the-project-in-one-page)
21. [Appendix A — verification log](#appendix-a--verification-log)
22. [Appendix B — implementation versus the original plan](#appendix-b--implementation-versus-the-original-plan)

---

## 1. What Auralis is

**The problem.** Choosing in-ear monitors is dominated by opinion. Reviews describe the same earphone as "warm" and "neutral"; shop pages list drivers, not sound; and a beginner has no way to connect what they already listen to with what they should buy. Meanwhile there *is* hard data on both sides — the audio a person listens to can be measured, and earphones have published frequency-response measurements — but nothing connects the two for an ordinary listener.

**What Auralis does.** A listener pastes YouTube links of music they like. The system downloads each track temporarily, measures its acoustic properties, aggregates the library into a listening signature, asks nine short perceptual questions, and combines both into a personal sound profile expressed in decibels relative to a published research target. It then compares that personal target against real measured earphone curves and ranks them, explaining each recommendation from the numbers that produced it.

**What makes it defensible.** Nothing in the chain is invented. Audio measurement is deterministic signal processing; earphone data comes from published measurements with recorded provenance; and the one uncertain link — that what you listen to says something about what you want to hear — is isolated into a single named parameter (`music_correlation`, ρ) that the evaluation suite sweeps from −0.837 to 0.95 so its influence can be seen rather than assumed.

**Project scale (counted during the audit).**

| Measure | Value |
| --- | --- |
| Backend Python modules | 76 files, 9,030 lines (plus 14 test files, 1,673 lines) |
| Frontend TypeScript/TSX | 69 files, 9,539 lines (7,717 hand-written; the rest is the generated API schema) |
| Database tables | 17 domain tables + `alembic_version` |
| HTTP endpoints | 17 (16 domain + health) |
| Backend tests | 139 passing (`pytest`, 42.5 s, includes PostgreSQL integration) |
| Frontend unit tests | 34 passing (`vitest`) |
| Browser tests | 6 passing (`playwright`, desktop + mobile) |
| Earphones in the database | 203, with 211 measurements and 422 processed curves |

---

## 2. Architecture

Auralis is a **modular monolith**: one Python package behind one API, one Next.js application, one PostgreSQL database, and background worker processes that share that database as their job queue instead of running a separate broker.

```text
                        BROWSER
                           |
                           |  same-origin fetch, HttpOnly session cookie
                           v
        +----------------------------------------------+
        |  NEXT.JS APP (web/)                           |
        |  React 19 pages, TanStack Query cache,        |
        |  motion animations, SVG visualisations        |
        |  /api/* is rewritten to the API server, so    |
        |  the API address never reaches the browser    |
        +----------------------------------------------+
                           |
                           v
        +----------------------------------------------+
        |  FASTAPI (backend/src/auralis/main.py)        |
        |  CSRF header middleware, gzip, error mapping  |
        |  routers: account, music, questionnaire,      |
        |           sound-profile, recommendations      |
        +----------------------------------------------+
                |                              |
     writes rows and jobs             reads derived rows
                v                              ^
        +----------------------------------------------+
        |  POSTGRESQL 18                                |
        |  identity | music | analyses | profiles |     |
        |  earphones + measurements | jobs              |
        +----------------------------------------------+
                ^                              |
      claims jobs with FOR UPDATE SKIP LOCKED  |
                |                              v
        +----------------------------------------------+
        |  WORKER PROCESSES (auralis worker)            |
        |  music.ingest        resolve + select tracks  |
        |  music.analyze_track download -> analyse      |
        |  music.build_profile aggregate the library    |
        +----------------------------------------------+
                           |
                           v
        +----------------------------------------------+
        |  ANALYSIS + MODEL LIBRARIES (pure Python)     |
        |  analysis/    audio -> features -> profile    |
        |  acoustics/   bands + FR processing           |
        |  sound_profile/ Bayesian fusion               |
        |  recommend/   scoring + explanations          |
        +----------------------------------------------+
```

**Why a monolith with a database queue.** The reasoning is recorded in `backend/src/auralis/jobs/__init__.py`: jobs are created in the same transaction as the rows they process, so there is no window where a row is committed but its job is lost; there is one fewer service to run; and `FOR UPDATE SKIP LOCKED` already gives safe concurrent claiming. The trade-off — the queue competes with the application for database connections — is acceptable at this scale.

**The dependency rule.** `auralis/analysis/` and `auralis/acoustics/` are pure computation: they import no database, HTTP or job-queue code. This is stated in `analysis/__init__.py` and holds in the source. It is why the analysis can be unit-tested without a database and why the same functions serve the API, the worker, the CLI and the evaluation suite.

---

## 3. Technology stack

Only technologies that are actually imported or executed by the code are listed. Each was confirmed by reading the import statements, not the documentation.

### Backend (`backend/pyproject.toml`)

| Technology | Where used | Why |
| --- | --- | --- |
| **Python 3.12+** | Whole backend | Required by `requires-python = ">=3.12,<3.14"` |
| **FastAPI** | `main.py`, five `router.py` files | Typed request/response models and an OpenAPI schema the frontend generates its client from |
| **Uvicorn** | Dev and production entry | ASGI server |
| **Pydantic 2 / pydantic-settings** | Every `schemas.py`, `config.py` | Validation at the edges; settings from environment variables |
| **SQLAlchemy 2** | `db.py`, every `models.py` | Typed ORM with modern `Mapped[...]` declarations |
| **psycopg 3** | `db.py` connection URL | PostgreSQL driver |
| **Alembic** | `backend/migrations/` | Two versioned migrations |
| **PostgreSQL 18** | All persistence | Relational integrity, JSONB for feature blobs, `FOR UPDATE SKIP LOCKED` for the queue |
| **yt-dlp** | `music/youtube.py`, `music/preview.py` | The only module that talks to YouTube |
| **PyAV (`av`)** | `analysis/decode.py` | Decodes compressed audio through bundled FFmpeg — no system FFmpeg install needed |
| **NumPy 2** | Everywhere numeric | Array maths for spectra, curves, posteriors |
| **SciPy** | `analysis/spectral.py` (`scipy.fft`), `analysis/loudness.py` (`scipy.signal.lfilter`) | FFT and IIR filtering for the K-weighting chain |
| **librosa** | `analysis/features.py` **only** | Rhythm and timbre: onset strength, beat tracking, HPSS, mel spectrogram, MFCC |
| **scikit-learn** | `analysis/curation.py` **only** | `KMeans`, `PCA` and `silhouette_score` for grouping a library into sonic clusters |
| **soxr** | `analysis/features.py` | High-quality resample to 22.05 kHz before rhythm analysis |
| **pytest, ruff, mypy** | `backend/tests/`, CI config | 139 tests; strict typing; linting |

**Not used, despite being plausible for a project like this:** PyTorch, TensorFlow, Keras, Hugging Face, any embedding model, any recommender library (Surprise, implicit), Redis, Celery, and any LLM API. There is no `torch`, `tensorflow` or LLM client anywhere in the repository. Section 6 explains what stands in their place.

### Frontend (`web/package.json`)

| Technology | Where used | Why |
| --- | --- | --- |
| **Next.js 16** (App Router) | `web/src/app/` | Routing, server rendering, and the `/api/*` rewrite that keeps the API same-origin |
| **React 19** + React Compiler | All components | UI; the compiler handles memoisation |
| **TypeScript 5** | Everything | The API client is generated from the backend's OpenAPI schema, so a contract break fails `tsc` |
| **Tailwind CSS 4** | All styling | Design tokens and utility classes |
| **TanStack Query 5** | `lib/api/hooks.ts` | Server-state cache, and the 1.5 s poll that drives the live analysis screen |
| **openapi-fetch + openapi-typescript** | `lib/api/client.ts`, `lib/api/schema.d.ts` | Typed client generated from the backend schema |
| **motion** (Framer Motion 13) | Visual components | Enter/exit animation, layout animation, `useReducedMotion` |
| **Radix UI slider** | Budget input | Accessible slider primitive |
| **lucide-react** | Icons | Icon set |
| **Vitest / Playwright** | `lib/*.test.ts`, `web/e2e/` | 34 unit tests, 6 browser tests |

Charts and visualisations are **hand-written SVG** (`components/signature/stage.tsx`, `components/viz/*`). There is no charting library.

---

## 4. End-to-end data flow

Each stage below names the file and function that performs it. Stages that do not exist in the code are not listed.

```text
 1  paste links        web/src/app/music/page.tsx
 2  parse + preview    music/urls.py:parse_youtube_url  +  music/preview.py:preview
 3  create submission  music/service.py:create_submission        -> rows + music.ingest job
 4  resolve sources    music/youtube.py:resolve                  (yt-dlp, metadata only)
 5  select tracks      music/selection.py:select                 (cheap filters, no download)
 6  per track:         music/pipeline.py:analyze_track
       download        music/youtube.py:download_audio           (temp dir, deleted after)
       decode          analysis/decode.py:decode_audio           (PyAV -> PCM)
       measure         analysis/features.py:extract              -> TrackFeatures (MEASURED)
       interpret       analysis/descriptors.py:describe          -> 0-1 scores (HEURISTIC)
       store           pipeline.py:_store_analysis               -> track_analyses (JSONB)
 7  curate library     analysis/curation.py:curate               (duplicates, outliers, clusters)
 8  aggregate          analysis/aggregate.py:build_profile       -> MusicProfileData (DERIVED)
 9  questionnaire      questionnaire/definition.py + router      -> 9 answers (USER-PROVIDED)
10  fuse               sound_profile/fusion.py:fuse              -> SoundProfileData (MODEL)
11  load candidates    recommend/service.py:load_candidates      (measured IEM curves)
12  score + explain    recommend/harman.py:HarmanPersonalRecommender.recommend
13  display            web/src/app/profile/page.tsx + components/profile/matches.tsx
```

### Stage by stage

**1–2. Input and validation.** The user pastes links into a textarea on `/music`. The client splits and parses them locally (`web/src/lib/youtube.ts`) for instant feedback, and `GET /api/music/link-preview` fetches titles through YouTube's public oEmbed endpoint for display only. The authoritative parse happens server-side in `music/urls.py:parse_youtube_url`, which reduces any URL to a `YouTubeRef(kind, id)` — the raw string is never passed downstream. Account-bound lists (`WL`, `LL`, `LM`) and endless auto-mixes (`RD…`) are rejected with specific error codes.

**3. Submission.** `music/service.py:create_submission` enforces the limits in `config.py` (20 URLs, 2 active submissions per user), writes `music_submissions` + `submission_sources`, and enqueues a `music.ingest` job in the same transaction.

**4–5. Resolution and selection.** The worker runs `music/pipeline.py:ingest`, which calls `music/youtube.py:resolve` (yt-dlp, `extract_flat` metadata only — no audio yet) and then `music/selection.py:select`. Selection is deliberately metadata-first: unavailable items, wrong durations (under 30 s or over 20 min), repeated songs and deliberately altered audio (nightcore, sped-up, 8D) are dropped before a single byte is downloaded, and a playlist larger than the 120-track cap is sampled evenly rather than truncated. Tracks already analysed at the current `ANALYZER_VERSION` are reused from `track_analyses`; only the rest get `music.analyze_track` jobs.

**6. Per-track analysis.** Detailed in section 5. The audio file exists only inside a `tempfile.TemporaryDirectory` in `music/acquire.py:fetch_and_extract` and is deleted when the block exits — Auralis never keeps a copy of anyone's music.

**7–8. Library aggregation.** When the last track settles, `pipeline.py:maybe_finalize` enqueues `music.build_profile`, which loads every successful analysis and calls `analysis/curation.py:curate` then `analysis/aggregate.py:build_profile`. The result is a `MusicProfileData` row in `music_profiles`.

**9–10. Questions and fusion.** `POST /api/questionnaire/responses` validates the answers against `questionnaire/definition.py:validate_answers`, stores them, and immediately rebuilds the sound profile through `sound_profile/service.py:rebuild_sound_profile`, which calls `fusion.py:fuse`. Answering is optional: a profile can be built from music alone, and every question accepts "not sure" (stored as `None`, contributing no evidence).

**11–13. Recommendation.** `GET /api/recommendations` loads the listener's latest sound profile, the rig-matched reference target and every candidate with a processed curve, then ranks them. The frontend renders the result in `components/profile/matches.tsx`.

---

## 5. The audio analysis

This is the measurement layer, and it is the part of Auralis that is least open to argument: given the same audio, it produces the same numbers.

### The four representations, and why they are separate

```text
RAW AUDIO            compressed bytes in a temp file, deleted after analysis
    |  analysis/decode.py:decode_audio  (PyAV -> stereo float32 @ 44.1 kHz)
PCM SIGNAL           numpy array, shape (2, n)
    |  analysis/features.py:extract
TRACK FEATURES       ~25 measured numbers per song            [MEASURED]
    |  analysis/descriptors.py:describe
TRACK DESCRIPTORS    6 scores in 0-1, e.g. "warmth"           [HEURISTIC]
    |  analysis/curation.py:curate + analysis/aggregate.py:build_profile
MUSIC PROFILE        per-band deviation of the whole library  [DERIVED]
```

The separation is enforced in the code, not just described: `features.py` contains no interpretation ("interpretation happens in `descriptors.py`, never here"), and both layers are stored side by side in the database so a later model can be rebuilt from the measurements without re-downloading anything.

### What is extracted, feature by feature

All of the following are fields of `TrackFeatures` in `backend/src/auralis/analysis/features.py`.

| Feature | What it represents | Computed by | Used for |
| --- | --- | --- | --- |
| `band_levels_db` (9 values) | Power per octave in each band, relative to the 500 Hz–2 kHz reference. Pink noise reads 0 dB everywhere | `spectral.py:analyse` — streaming STFT (`scipy.fft.rfft`, 8192-point, Hann, hop 4096) | **The core input to the whole personalisation chain** |
| `spectrum_db` + `spectrum_freqs_hz` | The same thing at 6 points per octave: a smooth curve | `spectral.py:analyse` via a row-normalised fractional-octave matrix | The live spectrum drawn on the analysis screen |
| `centroid_hz` (p10/median/p90) | Spectral centroid — the magnitude-weighted mean frequency, i.e. the "centre of gravity" of the sound | `spectral.py:analyse` | Drives the `brightness` descriptor (as log2) |
| `rolloff_hz` | The frequency below which 85 % of the magnitude lies | `spectral.py:analyse` | Stored; a brightness cross-check |
| `flatness` | Spectral flatness: geometric mean ÷ arithmetic mean of the power spectrum. Near 1 = noise-like, near 0 = tonal | `spectral.py:analyse` | Feeds the `density` descriptor |
| `effective_bandwidth_hz` | Highest frequency still within 70 dB of the spectral peak | `spectral.py:analyse` | **Codec honesty:** a 128 kbps source cut off at 15 kHz cannot tell us anything about "air", and those bands are excluded from taste inference |
| `integrated_lufs` | Loudness to ITU-R BS.1770: K-weighting, 400 ms blocks, absolute −70 LUFS gate plus a relative −10 LU gate | `loudness.py:measure` (filters designed from analogue prototypes, applied with `scipy.signal.lfilter`) | `energy` descriptor; silence rejection |
| `loudness_range_lu` | EBU Tech 3342 loudness range — the 10th-to-95th percentile spread of short-term loudness | `loudness.py:measure` | `dynamics` descriptor |
| `sample_peak_dbfs`, `peak_to_loudness_db` | True peak level and crest factor (peak minus loudness) | `features.py:extract` | `dynamics` descriptor — how compressed a master is |
| `side_to_mid_db` | Side-channel energy relative to mid: 10·log₁₀(S²/M²) where M=(L+R)/2, S=(L−R)/2 | `features.py:extract` | `width` descriptor |
| `tempo_bpm` | Estimated tempo | `librosa.beat.beat_track` on an onset-strength envelope at 22.05 kHz | Stored; context for clusters |
| `onset_rate_hz` | Detected note onsets per second | `librosa.onset.onset_detect` | `energy` and `density` descriptors |
| `percussive_ratio` | Percussive share of total energy from harmonic/percussive source separation | `librosa.decompose.hpss` | `energy` descriptor |
| `mfcc_mean`, `mfcc_std` (20 each) | Mel-frequency cepstral coefficients: the shape of the spectral envelope on a perceptual mel scale, decorrelated by a DCT. A compact "timbre fingerprint" | `librosa.feature.mfcc` over a mel spectrogram | **Similarity only** — duplicate detection and clustering in `curation.py`. They are never used as tonal-preference evidence |
| `analysed_seconds`, `sample_rate`, `source_codec`, `truncated` | Provenance of the measurement itself | `decode.py` / `features.py` | Honesty about what was actually measured |

**Two details worth being able to defend.** First, the centroid and roll-off use *magnitude* weighting rather than power weighting — the comment in `spectral.py` explains that power weighting would drag both towards the bass. Second, an **activity gate** discards frames more than 35 dB below the track's loud (p90) frames, so silence and fade-outs do not flatten the long-term average.

**Sampling.** Long tracks are analysed on their first ten minutes (`acquire.py:MAX_ANALYSED_SECONDS = 600`), because the long-term average spectrum has converged well before that. Rhythm and MFCC work uses three 30-second excerpts at 20 %, 50 % and 80 % of the track (`features.py:_excerpts`). Leading and trailing silence is trimmed at −50 dB relative to peak.

**Rejection.** A track is rejected — never silently substituted — if under 20 seconds of non-silent audio remain (`too_short`) or it is effectively silent (`silent`, below −60 LUFS). The reason is stored and displayed.

### From one song to a library

`analysis/curation.py:curate` runs first, and it exists because a playlist is not a clean sample:

1. **Duplicates** — tracks are compared in a standardised space of band levels plus MFCC timbre; anything closer than a distance threshold *and* within 3 seconds of the same length is treated as the same recording and given weight 0.
2. **Outliers** — a robust z-score across core metrics; anything beyond the threshold keeps a reduced weight rather than being deleted. One podcast in a music library cannot dominate the result.
3. **Clusters** — `sklearn.cluster.KMeans` with `PCA` and `silhouette_score` chooses a small number of sonic groups, which the profile page shows as "your library has these clusters".

`analysis/aggregate.py:build_profile` then produces the `MusicProfileData` stored in `music_profiles`. Per band it computes a **weighted median deviation from a 30-track reference corpus**, with a **seeded bootstrap** (400 resamples) giving a standard error and a 90 % interval. Bands whose content is codec-limited are excluded from taste inference. The output is not "your music is bassy" but "your library sits *x* dB above typical music in sub-bass, ±*y*".

That uncertainty is the mechanism by which small libraries are honestly discounted later: the evaluation shows the sub-bass 90 % interval shrinking from about 20 dB at 5 songs to 2.9 dB at 80.

---

## 6. Artificial intelligence and machine learning — what is actually there

This section exists because the honest answer is more interesting than the flattering one.

**There is no trained machine-learning model in Auralis.** Nothing is fitted to data collected by the project; no weights are learned; there is no neural network, no PyTorch or TensorFlow dependency, and no LLM is called anywhere in the codebase. A viva answer that claims otherwise is contradicted by `pyproject.toml` in ten seconds.

What the project does have, classified honestly:

| Component | File | Category | Note |
| --- | --- | --- | --- |
| Decode, STFT, band levels, centroid, roll-off, flatness, bandwidth | `analysis/spectral.py`, `decode.py` | **Deterministic signal processing** | Standard DSP; same input → same output |
| BS.1770 loudness, EBU loudness range | `analysis/loudness.py` | **Deterministic signal processing (standards-based)** | Implements published broadcast standards |
| Tempo, onsets, HPSS, MFCC | `analysis/features.py` via librosa | **Classical MIR algorithms** | Established published algorithms, not learned models |
| Descriptors (`warmth`, `energy`, …) | `analysis/descriptors.py` | **Heuristic** | A logistic of a robust z-score against a 30-track corpus. Transparent and reproducible, but *not* a validated perceptual model — the file says so itself |
| Duplicate detection, outlier weighting, clustering | `analysis/curation.py` | **Classical unsupervised ML** | K-means + PCA + silhouette from scikit-learn. Unsupervised, fitted per library at runtime; no persisted model |
| Library aggregation with bootstrap | `analysis/aggregate.py` | **Statistical estimation** | Weighted medians and seeded resampling |
| Personal sound profile | `sound_profile/fusion.py` | **Bayesian statistical model** | Closed-form Gaussian inference with explicitly named priors. Not trained — its parameters are set from literature or labelled as assumptions |
| Preference prediction | `acoustics/fr.py:olive_score` | **Published regression model** | The Olive/Welti/Khonsaripour in-ear model, a linear regression fitted by its authors on listener panels. Used as published; not refitted here |
| Personal-target extension of that model | `recommend/harman.py` | **Heuristic extension** | Applying a model fitted for the average listener to a personalised target is an extension its authors did not validate. The docstring says exactly this |
| Tuning-space PCA | `evaluation/structure.py` | **Unsupervised analysis** | NumPy SVD used to answer a design question, not to serve recommendations |

**So what is the "intelligence"?** It is a *measurement and inference pipeline*, not a learned model. The defensible claim is: "Auralis measures audio deterministically, aggregates it statistically with explicit uncertainty, and combines it with self-reported preference in a Bayesian model whose assumptions are named and swept. The one published ML component is a regression model from the acoustics literature, used as its authors published it."

**Why no trained model?** Because the training data does not exist. Supervised learning here needs outcome labels — which listener liked which earphone — and the project has none. Rather than invent them, the architecture is built so a fitted model can replace the assumed parameters later: `sound_profile/assumptions.py` is a single file listing every number a trained model would estimate instead.

---

## 7. The personal sound profile

Implemented in `backend/src/auralis/sound_profile/fusion.py` (814 lines), version `sound-profile/3`.

### What is being estimated

For each of eleven dimensions, the listener's **preferred deviation from a population reference**. For the tonal dimensions (`sub_bass`, `mid_bass`, `warmth`, `vocal_presence`, `treble`, `air`) the reference is the **Harman in-ear 2019 target** and the unit is **decibels**. For character, tolerance and priority dimensions (`energy`, `treble_tolerance`, `detail`, `soundstage`, `naturalness`) the reference is the population median in standard-deviation units.

### The model, in four steps

The docstring of `fusion.py` states the model; these are the actual formulas in the code.

**1. Population prior.** θ ~ N(0, σ²). σ per dimension comes from `assumptions.py`: 3.0 dB for bass, 2.5 dB for treble, 1.5 dB mids, 2.5 dB air.

**2. Music as a conditional prior** (`_music_prior`). The library's balance ẑ (median deviation in corpus-spread units, with bootstrap standard error SE) shifts the prior under a bivariate-normal assumption with correlation ρ:

```python
def _music_prior(sigma, music, rho):
    if music is None or rho == 0:
        return _Posterior(0.0, sigma**2)
    return _Posterior(
        rho * sigma * music.z,
        sigma**2 * (1 - rho**2) + (rho * sigma * music.se) ** 2,
    )
```

θ | music ~ N(ρ·σ·ẑ, σ²(1−ρ²) + (ρ·σ·SE)²). A noisy library (large SE) widens the variance and therefore counts for less — automatically.

**3. Answers as noisy observations** (`_questionnaire_observations`). Each answer maps to a value in the dimension's unit and is treated as y = θ + ε with Var ε = σ²(1−r)/r, where r = `answer_reliability` = 0.70. An answer inferred from a neighbouring question (air from treble, say) keeps half that reliability (`indirect_factor` = 0.5). "Not sure" contributes nothing.

**4. Posterior** (`_combine`) — plain precision weighting:

```python
def _combine(prior, observations):
    precision = 1 / prior.var + sum(1 / o.variance for o in observations)
    weighted = prior.mean / prior.var + sum(o.value / o.variance for o in observations)
    return _Posterior(weighted / precision, 1 / precision)
```

### The question this answers: are there fixed weights?

**No.** There is no "music = 70 %, questionnaire = 30 %" anywhere in the codebase. The balance between the two sources is an *emergent* consequence of three things: ρ (how informative music is assumed to be), r (how reliable an answer is), and the evidence actually present (library size and consistency through SE). A listener with 100 consistent songs and one vague answer gets a music-led profile; a listener with 6 songs and nine confident answers gets an answer-led profile. Nobody chose those ratios; the arithmetic produced them.

The default ρ is deliberate and documented: ρ = √r ≈ 0.837, chosen so that "a large library is exactly as informative as one direct answer". That is a **stated modelling choice, not a measured fact**, and it is the project's single biggest assumption.

### What comes out

`SoundProfileData` contains, per dimension: a 0–1 `value` that is the listener's estimated **population percentile** Φ(μ/σ); the posterior mean and SD; an 80 % credible interval (`CREDIBLE_Z = 1.2816`); the same estimate from **each source alone** (music-only and answers-only, so the UI can show what each contributed); an `agreement` verdict (`agree` / `refine` / `differ`) from `_agreement`; and a `basis` describing the strength of each evidence type. It also produces a nine-band **preference curve in dB** relative to the Harman target, plus that curve from each source separately.

Three properties worth noting for a viva. **Tolerance and priority dimensions take no music input at all** — nothing in a spectrum tells you how much treble a person can stand, so those come only from answers. A **treble-tolerance cap** (`_tolerance_cap`) can lower the treble target for a sensitive listener. And every stored profile carries `MODEL_VERSION = "sound-profile/3"`, so `auralis rebuild-profiles` can regenerate every profile from stored evidence when the model changes.

### How it is consumed

`recommend/harman.py:curve_draws` samples 256 draws from the posterior **per dimension, not per band**, so bands that share a dimension (lower and upper treble) move together. Those draws become 256 candidate personal targets, and every earphone is scored against all of them.

---

## 8. The earphone side

### Where the data comes from

`backend/src/auralis/iem/datasets.py`. Measurements are imported from the **AutoEq** project (Jaakko Pasanen; code MIT-licensed), pinned to one commit — `7ae0f56d53074872b028649617a22bbb4232feb7` — so any import is reproducible. Nothing is committed to this repository: files are fetched into a git-ignored cache and stored in the database with the exact commit and path they came from.

Only **one measurer** is imported: **oratory1990**, whose in-ear measurements use G.R.A.S. ear simulators compliant with **IEC 60318-4**. That restriction is the point. A target curve is only meaningful on the kind of fixture it was defined on, and the Harman in-ear target was defined on that fixture family, so mixing in measurements from other rigs would produce numbers that look comparable and are not. `RIG_FAMILIES` maps the accepted rigs (GRAS 43AC, 43ACB, 45BC, 45BC-10) to the family `iec60318-4`; anything else is not imported.

Licensing is recorded on every row, not assumed: *"Measurement by oratory1990, redistributed in AutoEq (MIT-licensed project). Used for non-commercial research with attribution; confirm permission before any other use."*

### Schema (`iem/models.py`)

| Table | Holds | Notable fields |
| --- | --- | --- |
| `iems` | One earphone | `brand` + `model` unique, `slug`, `driver_config` (JSONB, NULL when unknown), `specs_source_url`, `specs_retrieved_on` |
| `fr_measurements` | A raw measurement, exactly as received | `raw_points` (JSONB), `checksum` (unique per IEM), `source`, `source_url`, `source_ref` (`AutoEq@<commit>:path`), `rig`, `rig_family`, `channel`, `variant`, `license`, `retrieved_at` |
| `fr_targets` | A published target curve, stored like a measurement | `name` (`harman-ie-2019`), `citation`, `rig_family`, `raw_points`, `checksum` |
| `iem_acoustic_profiles` | Processed curve + features for one measurement | `processor_version`, `target_name`, `grid_db`, `features`; unique per (measurement, version, target) |
| `iem_price_observations` | A price *observation*, never a property | `amount`, `currency`, `source`, `source_url`, `observed_at` |

The design rule is stated in the module docstring: raw points and provenance are kept forever; derived profiles are separate rows keyed by processor version, so reprocessing never destroys evidence. `iem/catalog.py` **refuses** a price without a source URL and an observation date, and a driver configuration without a specs source.

**Current state: 203 earphones, 211 measurements, 2 targets, 422 processed curves, and 0 prices.** Because there are no prices, the budget filter is inert in practice — `_within_budget` returns `True` for unknown prices rather than silently dropping products. This is a real, honest limitation and it should be stated in the demo.

### Measurement processing (`acoustics/fr.py`, version `fr/2`)

```text
raw (Hz, dB) points
  -> validate_points   reject malformed input
  -> to_grid           resample onto a common 1/48-octave log grid;
                       frequencies outside the measured range stay NaN, never extrapolated
  -> normalise         align at 500 Hz (level, not tone, is what differs between rigs)
  -> compensate        error = measurement − rig-matched target
  -> smooth            1/6-octave smoothing for band features
  -> band_features     nine-band summary + Olive statistics
```

Keeping gaps as NaN rather than filling them is what allows `olive_inear` to refuse to score a curve whose coverage of the model's range is below 80 %.

---

## 9. The recommendation engine

Implemented in `backend/src/auralis/recommend/harman.py`, version `harman-personal/1`. It is **content-based**: it compares an acoustic description of the listener with an acoustic description of each product. There is no collaborative filtering, no user-similarity, and no learned ranker — and with no user-outcome data, there could not be.

### The pipeline

```text
SoundProfileData (posterior, in dB)          Candidate curves (measured, on the 1/48-oct grid)
        |                                             |
        |  curve_draws: 256 seeded posterior draws     |
        |  offsets_on: interpolated in log-frequency   |
        v                                             v
   personal target = reference (Harman IE 2019) + your offsets
        |
        |  error = measured response − personal target      (both aligned at 500 Hz)
        v
   Olive in-ear preference model  ->  score per draw
        |
        |  mean, 10th and 90th percentile over the 256 draws
        v
   rank by expected score  ->  top N  ->  region fits  ->  reasons
```

### Filtering, before any scoring

```python
eligible = [
    c for c in candidates
    if c.measurement.rig_family == target.rig_family == constraints.rig_family
    and _within_budget(c.price, constraints)
    and fr.olive_inear(fr.compensate(...)) is not None
]
```

Three gates: the measurement must be on the same rig family as the target; the price must be within budget *when a comparable price is known*; and the measurement must cover enough of the model's frequency range to be scorable. `load_candidates` additionally takes **one measurement per earphone**, preferring the stock configuration — the comment explains why: choosing the best-scoring variant would flatter products that happen to have many measured variants.

### The scoring formula

From `acoustics/fr.py`, the published Olive/Welti/Khonsaripour (2017) in-ear model:

```python
score = OLIVE_INTERCEPT − OLIVE_SD·SD − OLIVE_SLOPE·|slope| − OLIVE_AAE·AAE
#       100.0795         − 8.5·SD      − 6.796·|slope|      − 3.475·AAE
```

where, over the ISO R40 frequency grid from 20 Hz to 10 kHz:

- **SD** — standard deviation of the error curve: how *uneven* the deviation is.
- **slope** — the linear trend of the error against log-frequency: whether it is tilted bright or dark overall.
- **AAE** — absolute average error over 40 Hz–10 kHz after aligning at 500 Hz: how far off it is on average.

All three terms are subtractive: a perfectly flat error against the target scores ~100. The implementation is vectorised so all 256 posterior draws are scored in one call.

**Why uncertainty is carried all the way through.** A listener whose profile is confident gets a narrow range; a listener with six songs and no answers gets a wide one. The UI shows the predicted preference as a range, not a single figure, which is what makes the output honest.

### Explanations

`_reasons` and `_region` generate text **from the numbers that produced the score, after the score exists**. For each frequency region, the code computes the mean error, compares it against a tolerance derived from the listener's own posterior width (`max(1.0 dB, 1.2816 × SD)`), and labels the fit `within` / `above` / `below` / `unreliable`. Regions above 10 kHz are always `unreliable` — IEC 60318-4 couplers are only specified to 10 kHz and the preference model stops there too.

Each reason also carries what the target rests on (`_basis_words`): "your music", "your music, refined by your answers", "your answers", "your music and answers disagree here", or "the population reference". The evaluation audited **170 reasons across 60 recommendations and re-derived all 170 from the raw curves — zero inconsistencies**.

A second, simpler engine exists for comparison: `recommend/band_rms.py` (`band-rms/1`) ranks by reliability-weighted RMS band error, ignoring the tilt and smoothness terms. The evaluation reports that the two engines agree on about half of a top 10 — useful evidence that the choice of scoring function matters.

---

## 10. The frontend

Next.js App Router. Every page is a client component that reads server state through TanStack Query hooks in `web/src/lib/api/hooks.ts`.

| Route | File | Purpose | Key state and calls |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | Landing: hero, the journey, an interactive band explorer | Static composition of `components/landing/*` |
| `/start` | `app/start/page.tsx` | Create an anonymous session from a display name | `useMe`, `useStartSession` → `POST /api/session` → push `/music` |
| `/music` | `app/music/page.tsx` | Paste links, see them validated and previewed live | `useLinkPreviews` (per-URL queries), `useCreateSubmission` → `POST /api/music/submissions` → push `/analysis/{id}` |
| `/analysis/[id]` | `app/analysis/[id]/page.tsx` | Live progress: spectrum stage, spinning records, track list, listening map | `useSubmission(id)` polling every 1.5 s while active |
| `/tune` | `app/tune/page.tsx` | The nine perceptual questions plus practical details | `useQuestionnaire`, `useSoundPreview` (live, unsaved fusion), `useSubmitAnswers` |
| `/profile` | `app/profile/page.tsx` | The sound portrait, what shaped it, and matches | `useSoundProfile`, `useMusicProfile`, `useRecommendations` |
| `/method` | `app/method/page.tsx` | Plain-language explanation of the method | Static |

### The screens worth demonstrating

**Music input (`app/music/page.tsx`, 268 lines).** Links are split and parsed in the browser (`lib/youtube.ts`) so errors appear as you type, and each valid link gets a preview card with title and artwork. The server re-validates everything on submit — client-side parsing is for feedback only, never trust.

**Analysis (`app/analysis/[id]/page.tsx`, 345 lines).** The most animated screen. `useSubmission` polls every 1.5 seconds and stops the moment the status leaves the active set. It renders:
- `components/analysis/signal-stage.tsx` — the live median spectrum building up as songs complete, with a scanning highlight while work is in progress.
- `components/analysis/spinning-records.tsx` — one spinning vinyl record per song **currently held by a worker** (`status === "analyzing"`), with the song's artwork as the label. The count is the real number of concurrent analyses; any that do not fit the row are folded into a "+N" chip rather than dropped.
- `components/analysis/track-list.tsx` — every track with its state, and an honest reason when one fails.
- `components/viz/listening-map.tsx` — brightness × energy scatter, 0.5 being "typical for the reference corpus".

**Questionnaire (`app/tune/page.tsx`, 263 lines).** Each answer immediately calls `POST /api/sound-profile/preview`, which fuses the draft answers with the stored music profile **without saving**, so the curve visibly moves as the listener answers. This is the clearest demonstration of the model: change one answer, watch the posterior shift, and note that it does not jump to the answer — it moves partway, because the music is also evidence.

**Profile (`app/profile/page.tsx`, 246 lines).** `sound-portrait.tsx` draws the personal preference curve with its credible band; `dimension-meter.tsx` shows each dimension with an `evidence-tag.tsx` (three dots) for how much evidence stands behind it; `shaped-by.tsx` separates what came from music versus answers; `matches.tsx` lists recommendations with their reasons and measurement provenance.

### Frontend conventions

- **Typed end to end.** `lib/api/schema.d.ts` is generated from the backend's OpenAPI document (`npm run api:types`), so removing a backend field breaks `tsc` in CI rather than in the browser.
- **Errors are typed too.** `unwrap()` in `lib/api/client.ts` converts `{error: {code, message}}` responses into a typed `ApiError`, including a `network` case.
- **CSRF.** A middleware adds the `x-auralis-client: web` header to every request; the backend rejects state-changing requests without it.
- **Accessibility and motion.** Visual components respect `prefers-reduced-motion`, and live regions announce progress.

---

## 11. Backend and API

**Entry point:** `backend/src/auralis/main.py:create_app()`. It installs the CSRF middleware and gzip, registers three exception handlers that map domain errors onto a consistent `{"error": {"code", "message"}}` shape, exposes `/api/health`, and includes five routers. Interactive docs are served at `/api/docs` in development and **disabled in production**.

### Endpoints

| Method | Endpoint | Purpose | Input | Output | File |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | Liveness + database check | — | `{status}` | `main.py` |
| POST | `/api/session` | Create an anonymous account and session | `{display_name}` | `MeOut` + HttpOnly cookie | `profiles/router.py` |
| GET | `/api/session` | Current session, or empty | cookie | `SessionOut` | `profiles/router.py` |
| GET | `/api/me` | Listener profile and journey state | cookie | `MeOut` | `profiles/router.py` |
| PATCH | `/api/me/profile` | Update name, budget, currency, gear, experience | `ProfileUpdate` | `ProfileOut` | `profiles/router.py` |
| DELETE | `/api/me` | Delete the account and all personal data | — | 204 | `profiles/router.py` |
| POST | `/api/music/submissions` | Submit YouTube links | `{urls: string[]}` | `SubmissionOut` (202) | `music/router.py` |
| GET | `/api/music/submissions` | List the listener's submissions | — | `SubmissionSummary[]` | `music/router.py` |
| GET | `/api/music/submissions/{id}` | Live progress, counts, tracks, spectrum | path id | `SubmissionOut` | `music/router.py` |
| GET | `/api/music/profile` | Latest music profile | — | `MusicProfileOut` | `music/router.py` |
| GET | `/api/music/link-preview` | Title/artwork for one pasted link | `?url=` | `LinkPreviewOut` | `music/router.py` |
| GET | `/api/questionnaire` | The questions and options | — | `Questionnaire` | `questionnaire/router.py` |
| GET | `/api/questionnaire/responses/latest` | The listener's last answers | — | `LatestResponse` | `questionnaire/router.py` |
| POST | `/api/questionnaire/responses` | Save answers and rebuild the profile | `{version, answers}` | `SoundProfileOut` (201) | `questionnaire/router.py` |
| GET | `/api/sound-profile` | Latest personal sound profile | — | `SoundProfileOut` | `sound_profile/router.py` |
| POST | `/api/sound-profile/preview` | Fuse draft answers without saving | `{answers}` | `SoundProfilePreview` | `sound_profile/router.py` |
| GET | `/api/recommendations` | Ranked earphones with explanations | `?limit=` | `RecommendationsOut` | `recommend/router.py` |

Seventeen endpoints. Every one is authenticated by session cookie except `/api/health` and `POST /api/session`, and every query is scoped to the session user — `music/service.py:_owned_submission` returns **404, not 403**, for another user's submission, so the API does not confirm that an id exists.

### Layering

Each module follows the same shape, which makes the codebase easy to navigate:

```text
router.py    HTTP: paths, status codes, dependencies      (thin)
schemas.py   Pydantic request/response models            (the contract)
service.py   Request-side logic, ownership, queries      (the work)
models.py    SQLAlchemy ORM rows                          (the storage)
pipeline.py  Job handlers, for modules with background work
```

### Background jobs

`jobs/queue.py` is 146 lines and does the whole queue. `claim()` is the interesting part: a `SELECT ... FOR UPDATE SKIP LOCKED` subquery picks the next ready job by (priority, run_after) and a single `UPDATE ... RETURNING` marks it running and increments attempts — so two workers can never take the same job. Failures get exponential backoff (`backoff_seconds`), a heartbeat thread keeps long jobs alive, and `requeue_stale` recovers jobs whose worker died. Dedupe keys prevent the same work being queued twice while it is `queued` or `running`.

Three handlers are registered (`music/pipeline.py`): `music.ingest`, `music.analyze_track`, `music.build_profile`.

---

## 12. Database

**PostgreSQL 18**, accessed through SQLAlchemy 2 with typed `Mapped[...]` declarations. Schema is managed by Alembic (two migrations in `backend/migrations/versions/`). The live database contains **17 domain tables** plus `alembic_version`.

| Group | Tables | What is persisted |
| --- | --- | --- |
| Identity | `users`, `sessions`, `profiles` | Display name, budget, currency, gear, experience; session token **hashes** only |
| Music input | `music_submissions`, `submission_sources`, `submission_tracks`, `tracks` | What was submitted, what each link resolved to, and per-submission track state (`queued`/`analyzing`/`done`/`failed`/`skipped`) |
| Analysis | `track_analyses` | Measured features (JSONB) + descriptors, keyed by `analyzer_version`. **Shared across listeners** — a track is public data, so two people submitting the same song reuse one analysis |
| Derived profiles | `music_profiles`, `questionnaire_responses`, `sound_profiles` | The listening representation, the answers, and the fused profile — each versioned |
| Earphones | `iems`, `fr_measurements`, `fr_targets`, `iem_acoustic_profiles`, `iem_price_observations` | Catalogue, raw measurements with provenance, targets, processed curves, price observations |
| Work | `jobs` | The queue: kind, payload, status, attempts, dedupe key, heartbeat |

**Three storage rules, visible in the models.**

1. **Raw data is kept as received.** `fr_measurements.raw_points` and `track_analyses.features` store the original numbers; derived rows are separate and carry the version of the code that produced them.
2. **Unknown stays NULL.** There is no placeholder or default standing in for a missing measurement, price or answer.
3. **Personal data is minimal and deletable.** The only personal fields are a display name and optional preferences. Audio is never stored. `DELETE /api/me` cascades through every table holding personal data and leaves shared track analyses intact — and there is a test for exactly that.

**What stays temporary:** downloaded audio (a `TemporaryDirectory` for the duration of one analysis), yt-dlp's cache, and draft questionnaire answers being previewed (`POST /api/sound-profile/preview` computes and returns without writing).

---

## 13. Complete file map

Every meaningful source and configuration file, with what it does, what goes in, what comes out, and who uses it. Generated files (`web/src/lib/api/schema.d.ts`), package manifests' lock files, `__init__.py` files that only carry a docstring, and dependency internals are omitted deliberately — they carry no project logic.

### 13.1 Backend — application core

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `main.py` (101) | FastAPI application factory. `create_app()`, `CsrfHeaderMiddleware`, `_error()`, three exception handlers, `/api/health` | HTTP requests → JSON responses | Uvicorn; every browser request |
| `config.py` (63) | All settings from `AURALIS_*` environment variables. `Settings`, `get_settings()` (LRU-cached), `resolved_js_runtime()` | Environment → typed settings | Every module that needs a limit, path or the database URL |
| `db.py` (82) | Engine, session factory, declarative base. `Base`, `UUIDPk`, `Timestamped`, `new_session()`, `session_scope()`, `get_db()` | Settings → SQLAlchemy sessions | Every service, pipeline and CLI command |
| `models.py` (37) | Imports every ORM model so `Base.metadata` is complete | — | Alembic migrations, tests |
| `cli.py` (121) | The `auralis` command: `worker`, `evaluate`, `calibrate`, `import-autoeq`, `import-catalog`, `import-fr`, `rebuild-profiles` | Command line → side effects | Operators; `scripts/dev.py` |
| `core/errors.py` (34) | Domain errors that map onto HTTP: `DomainError`, `NotFound`, `Conflict`, `Unauthorized`, `RateLimited` | — | Services; handled in `main.py` |
| `core/time.py` (5) | `utcnow()` — one timezone-aware clock for the whole codebase | — | Auth, jobs, models |

### 13.2 Backend — identity and profile

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `auth/service.py` (61) | Anonymous-first sessions. `hash_token()` (SHA-256), `create_session()` (256-bit `secrets.token_urlsafe`), `user_for_token()`, `revoke_all()` | Display name → token; cookie token → `User` | `auth/deps.py`, `profiles/router.py` |
| `auth/deps.py` (50) | FastAPI dependencies: `current_user`, `optional_user`, `set_session_cookie` (HttpOnly, SameSite=Lax, Secure in production), `clear_session_cookie` | Request cookie → `User` | Every authenticated route |
| `auth/models.py` (35) | `User`, `AuthSession` (stores `token_hash`, never the token) | — | Auth service, cascade deletes |
| `profiles/service.py` (100) | `create_user`, `get_profile`, `update_profile`, `journey()` (which step the listener is on), `me()`, `delete_account()` | User → profile/journey; delete → cascade | `profiles/router.py`, `recommend/service.py` |
| `profiles/models.py` (41) | `Profile`: display name, budget range, currency, gear, experience | — | Profile service, recommendation constraints |
| `profiles/schemas.py` (85) | `ProfileOut`, `ProfileUpdate`, `SessionCreate`, `Journey`, `MeOut`, `SessionOut` | — | Router; generated TypeScript client |
| `profiles/router.py` (54) | The five account endpoints | HTTP → service calls | Frontend `useMe`, `useStartSession`, `useDeleteAccount` |

### 13.3 Backend — music ingestion

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `music/urls.py` (128) | **Security boundary.** Strict parsing of user URLs: `parse_youtube_url()`, `YouTubeRef`, `InvalidYouTubeUrl`. Rejects account-bound lists (`WL`/`LL`/`LM`), endless mixes (`RD…`), malformed ids, non-http schemes, over-long input | Raw string → `(kind, id)` | `music/service.py`, `music/preview.py`; tested in `test_urls.py` |
| `music/youtube.py` (231) | The **only** module that talks to YouTube. `resolve()` (flat metadata), `download_audio()` (bestaudio under the byte cap, into a temp dir), `classify()` (error → code), `_duration_filter` | `YouTubeRef` → `ResolvedSource` / `DownloadedAudio` | `music/pipeline.py`, `music/acquire.py` |
| `music/preview.py` (78) | Instant titles for pasted links via YouTube's public oEmbed endpoint, cached briefly, degrading to silence on failure | Video id → `LinkPreview` | `GET /api/music/link-preview` |
| `music/selection.py` (101) | Metadata-level selection before any download: `select()`, `title_key()` (near-duplicate titles), `is_altered()` (nightcore/sped-up/8D), `evenly_spaced()` | Candidates → kept + reasons | `music/pipeline.py:ingest`; tested in `test_selection.py` |
| `music/acquire.py` (54) | One track end to end inside a `TemporaryDirectory`: `fetch_and_extract()` | Video id → `AcquiredAnalysis` (features + meta + timings) | `music/pipeline.py:analyze_track` |
| `music/pipeline.py` (508) | The three job handlers. `ingest()`, `analyze_track()`, `build_profile()`, plus `maybe_finalize()`, `_set_track_status()`, `_store_analysis()`, `_record_failure()`, `load_library()`, `rebuild_music_profile()` | Job payload → database rows and further jobs | The worker; tested in `test_pipeline.py` |
| `music/service.py` (373) | Request-side logic: `create_submission()` (limits, validation), `get_submission()` (progress, stages, live spectrum), `list_submissions()`, `get_music_profile()`, `_owned_submission()` | HTTP request → response models | `music/router.py` |
| `music/models.py` (140) | `Track`, `TrackAnalysis`, `MusicSubmission`, `SubmissionSource`, `SubmissionTrack`, `MusicProfile` | — | The whole music side |
| `music/schemas.py` (132) | `SubmissionCreate`, `SubmissionOut`, `SubmissionTrackOut`, `TrackCounts`, `Stage`, `LiveSpectrum`, `MusicProfileOut`, … | — | Router; generated TypeScript types |
| `music/router.py` (61) | The five music endpoints | HTTP → service | Frontend music and analysis screens |

### 13.4 Backend — audio analysis (pure, no I/O)

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `analysis/decode.py` (101) | PyAV decode to stereo float32 at 44.1 kHz, bounded by `max_seconds`. `decode_audio()`, `AudioSignal`, `AudioDecodeError` | Audio file → PCM array | `music/acquire.py` |
| `analysis/spectral.py` (154) | Streaming STFT statistics: `analyse()`, `_fractional_octave_matrix()`, `_frames()`. Band levels, spectrum curve, centroid, roll-off, flatness, effective bandwidth, activity gate | PCM → `SpectralStats` | `analysis/features.py` |
| `analysis/loudness.py` (112) | ITU-R BS.1770 / EBU Tech 3342: `measure()`, `k_weight()`, `_biquad_high_shelf()`, `_biquad_high_pass()` | PCM → `LoudnessStats` (LUFS, LRA) | `analysis/features.py` |
| `analysis/features.py` (182) | **The measured layer.** `extract()` builds `TrackFeatures`; `_trim_silence()`, `_excerpts()`; librosa for tempo, onsets, HPSS, MFCC | `AudioSignal` → `TrackFeatures` | `music/acquire.py`, descriptors, aggregation, tests |
| `analysis/descriptors.py` (170) | **The heuristic layer.** `describe()`, `raw_metrics()`, `robust_z()`, `_logistic()`, `RAW_METRICS`, `DESCRIPTOR_SPECS`, `load_calibration()` | `TrackFeatures` + `calibration.json` → six 0–1 scores | `music/pipeline.py`, profile aggregation |
| `analysis/calibration.json` | The reference corpus summary: per-metric median and robust SD (`corpus-2026-09`, 30 tracks) | — | `descriptors.py`; rebuilt by `tools/calibrate.py` |
| `analysis/curation.py` (168) | Library hygiene: `curate()`, `find_duplicates()`, `_robust_z()`; K-means + PCA + silhouette for sonic clusters | Track features → weights, duplicates, clusters | `analysis/aggregate.py`; tested in `test_curation.py` |
| `analysis/aggregate.py` (532) | **The library representation.** `build_profile()`, `weighted_quantiles()`, `_bootstrap_median()` (400 seeded resamples), `_confidence()`, `label_clusters()` | Curated tracks → `MusicProfileData` | `music/pipeline.py:build_profile` |
| `analysis/version.py` (11) | `ANALYZER_VERSION`, `DESCRIPTORS_VERSION` — stored with every derived row | — | Everything that writes derived data |

### 13.5 Backend — shared acoustics

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `acoustics/bands.py` (79) | The nine canonical bands (20 Hz–20 kHz), `BANDS_VERSION`, `Band`, `log_grid()`, `band_mask()` | — | **Both** the music side and the earphone side — this is what makes them comparable |
| `acoustics/fr.py` (285) | Frequency-response processing `fr/2`: `validate_points`, `to_grid`, `normalise`, `compensate`, `smooth`, `band_features`, `olive_terms`, `olive_score`, `olive_inear`, `process` | Raw (Hz, dB) points → normalised curve + features | IEM import, recommender, evaluation; tested in `test_fr.py` |

### 13.6 Backend — questionnaire, sound profile, recommendations

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `questionnaire/definition.py` (163) | The nine questions in listener language, `QUESTIONNAIRE_VERSION = "perceptual/1"`, `validate_answers()`. Every question accepts "not sure" → `None` | — | Router, fusion, tests |
| `questionnaire/models.py` (21) | `QuestionnaireResponse` — answers as stored JSON with their version | — | Fusion, profile rebuild |
| `questionnaire/router.py` (86) | Serve questions, read the latest answers, submit answers (which rebuilds the profile) | HTTP → `SoundProfileOut` | `/tune` |
| `sound_profile/assumptions.py` (148) | **Every numeric assumption in one file.** `Assumption` (value, unit, status, basis, sweep), `ModelParameters`, `PRIOR_SD_*`, `ANSWER_RELIABILITY`, `INDIRECT_FACTOR`, `MUSIC_CORRELATION` | — | `fusion.py`, the evaluation sweeps, the API's provenance output |
| `sound_profile/fusion.py` (814) | **The model.** `fuse()`, `estimate()`, `_dimension()`, `_combine()`, `_music_prior()`, `_questionnaire_observations()`, `_curve()`, `_agreement()`, `DIMENSIONS`, `CURVE_SOURCES` | `MusicProfileData` + answers → `SoundProfileData` | `sound_profile/service.py`; tested in `test_fusion.py` |
| `sound_profile/service.py` (104) | `rebuild_sound_profile()`, `latest_sound_profile()`, `preview_sound_profile()` (fuse without saving), `to_out()` | User → stored or previewed profile | Questionnaire router, sound-profile router, recommendations |
| `sound_profile/models.py` (27) | `SoundProfile` row: data JSON, model version, source ids | — | Service, rebuild tooling |
| `sound_profile/router.py` (41) | `GET /api/sound-profile`, `POST /api/sound-profile/preview` | HTTP → profile | `/tune` live preview, `/profile` |
| `recommend/base.py` (153) | The contract: `Recommender` protocol, `Candidate`, `Target`, `Constraints`, `Recommendation`, `Reason`, `RegionFit`, `Prediction`, `MeasurementRef`, `Price` | — | Both engines, the service, the API |
| `recommend/harman.py` (456) | **The engine** `harman-personal/1`: `HarmanPersonalRecommender.score/recommend/_explain/_region`, `curve_draws()`, `offsets_on()`, `_reasons()`, `REGIONS` | Profile + candidates + target → ranked, explained results | `recommend/service.py`; tested in `test_recommend.py` |
| `recommend/band_rms.py` (31) | `band-rms/1`: the same inputs ranked by reliability-weighted RMS band error — a comparison baseline | Same → different ranking | Evaluation's method comparison |
| `recommend/service.py` (197) | `load_target()`, `load_candidates()` (one measurement per IEM, rig-matched), `_latest_prices()`, `constraints_for()`, `recommendations_for()` | Database → engine inputs → `RecommendationsOut` | `recommend/router.py` |
| `recommend/router.py` (20) | `GET /api/recommendations` | `?limit` → recommendations | `/profile` |

### 13.7 Backend — earphone data, jobs, tooling, evaluation

| File (lines) | Purpose and key symbols | Input → Output | Used by |
| --- | --- | --- | --- |
| `iem/models.py` (134) | `Iem`, `FrMeasurement`, `FrTarget`, `IemAcousticProfile`, `IemPriceObservation` | — | Import, recommendation, evaluation |
| `iem/datasets.py` (266) | AutoEq import pinned to one commit: `import_targets()`, `import_oratory1990_inear()`, `fetch()`, `prefetch()`, `RIG_FAMILIES`, `ORATORY1990_LICENSE` | Pinned dataset → measurements with provenance | `auralis import-autoeq` |
| `iem/importer.py` (160) | `import_points()`, `import_csv()`, `process_measurement()`, `checksum()`, `get_or_create_iem()` — refuses duplicates, never alters raw points | Raw points + provenance → rows | `datasets.py`, `auralis import-fr` |
| `iem/catalog.py` (122) | Catalogue facts from CSV: `import_catalog()`, `parse_drivers()`. **Refuses** a price with no source URL and date | CSV → catalogue rows | `auralis import-catalog` |
| `jobs/queue.py` (146) | `enqueue()`, `claim()` (`FOR UPDATE SKIP LOCKED`), `mark_succeeded/failed`, `heartbeat()`, `requeue_stale()`, `backoff_seconds()` | Job rows → claimed work | The worker, every enqueue site |
| `jobs/worker.py` (143) | `run_workers()` (process pool), `worker_loop()`, `run_one()`, `_heartbeat_loop()` | Queue → executed handlers | `auralis worker` |
| `jobs/registry.py` (68) | `@job_handler` decorator, `JobContext`, `PermanentJobError`, `RetryJob`, `load_handlers()` | — | `music/pipeline.py` handlers |
| `jobs/models.py` (45) | `Job`: kind, payload, status, attempts, priority, dedupe key, heartbeat | — | Queue |
| `tools/calibrate.py` (72) | Rebuild `calibration.json` from a corpus TSV of video ids | Corpus → calibration | `auralis calibrate` |
| `tools/rebuild.py` (27) | `rebuild_all()` — regenerate derived profiles from stored evidence after a model change | Database → new profile rows | `auralis rebuild-profiles` |
| `evaluation/data.py` (87) | Anonymous evaluation inputs: `track_pool()`, `listener_libraries()`, `corpus_genres()` | Database → anonymous aggregates | The evaluation suite |
| `evaluation/representation.py` (191) | Is the music representation stable and informative? `ci_width_by_size()`, `split_half()`, `genre_contrast()`, `reference_corpus_slope()` | Libraries → statistics | `evaluation/report.py` |
| `evaluation/recommendation.py` (327) | Do rankings behave? `sensitivity()`, `ablation()` (music only / answers only / both), `assumption_sensitivity()`, `method_comparison()`, `explanation_audit()`, `kendall()` | Profiles + candidates → evidence tables | `evaluation/report.py` |
| `evaluation/structure.py` (140) | `pca()` of measured error curves (NumPy SVD) and `implementation_check()` against AutoEq's published scores | Measurements → components, validation | `evaluation/report.py` |
| `evaluation/report.py` (305) | `run()` — execute everything and write `evaluation.md` + `evaluation.json` | — | `auralis evaluate` |

### 13.8 Backend — tests and migrations

| File | Covers |
| --- | --- |
| `tests/test_analysis.py` | Decode, loudness, spectral statistics, feature extraction |
| `tests/test_fr.py` | Grid, normalisation, compensation, Olive statistics |
| `tests/test_fusion.py` | The Bayesian model: priors, observations, agreement, curve construction |
| `tests/test_recommend.py` | Ranking behaviour, filtering, explanations |
| `tests/test_curation.py`, `test_selection.py`, `test_urls.py` | Duplicates and outliers; metadata selection; URL parsing and rejection |
| `tests/test_pipeline.py` | Job handlers end to end against PostgreSQL |
| `tests/test_api.py`, `test_contracts.py` | Endpoints, authorisation, CSRF, error shapes, schema stability |
| `tests/test_evaluation.py` | The evaluation suite itself |
| `tests/conftest.py`, `factories.py` | Database fixtures and test data builders |
| `migrations/versions/20260917_..._initial_schema.py` | Identity, music, analysis, profiles, jobs |
| `migrations/versions/20260918_..._iem_dataset.py` | Earphone catalogue, measurements, targets, processed profiles, prices |

### 13.9 Frontend

| File (lines) | Purpose | Data in → out |
| --- | --- | --- |
| `app/layout.tsx` (40) | Root layout, fonts, providers | — |
| `app/page.tsx` (22) | Landing page composition | Static |
| `app/start/page.tsx` (85) | Name → anonymous session | `POST /api/session` → redirect |
| `app/music/page.tsx` (268) | Link input, live validation, previews, submit | `useLinkPreviews`, `useCreateSubmission` |
| `app/analysis/[id]/page.tsx` (345) | Live analysis screen | `useSubmission` (1.5 s poll) |
| `app/tune/page.tsx` (263) | Questionnaire + practical details | `useQuestionnaire`, `useSoundPreview`, `useSubmitAnswers` |
| `app/profile/page.tsx` (246) | Sound portrait, evidence, matches | `useSoundProfile`, `useMusicProfile`, `useRecommendations` |
| `app/method/page.tsx` (147) | Plain-language method page | Static |
| `app/error.tsx`, `app/not-found.tsx` (20 each) | Error and 404 boundaries | — |
| `lib/api/client.ts` (77) | Typed `openapi-fetch` client, `ApiError`, `unwrap()`, CSRF header middleware | Responses → typed data or typed errors |
| `lib/api/hooks.ts` (195) | Every server-state hook and the polling policy | Queries and mutations |
| `lib/api/schema.d.ts` | **Generated** from the backend OpenAPI document (`npm run api:types`) | — |
| `components/analysis/signal-stage.tsx` (150) | The live spectrum stage with a scanning highlight | Track spectra → SVG |
| `components/analysis/spinning-records.tsx` (235) | One spinning record per song currently held by a worker | `tracks[status==="analyzing"]` → animated discs |
| `components/analysis/track-list.tsx` (145) | Every track with state and honest failure reasons | Tracks → list |
| `components/analysis/song-compare.tsx` (45), `stepper.tsx` (60) | One song against the signature; the pipeline as a timeline | Submission → SVG/UI |
| `components/signature/stage.tsx` (529) | The core spectrum chart used across screens | Curves → SVG |
| `components/signature/band-rail.tsx` (121), `spark.tsx` (56) | Band axis; one-song mini spectrum | Bands/spectra → SVG |
| `components/profile/sound-portrait.tsx` (330) | The personal preference curve with its credible band | `SoundProfileData` → SVG |
| `components/profile/dimension-meter.tsx` (168) | Per-dimension meters with credible ranges | Dimensions → UI |
| `components/profile/evidence-tag.tsx` (26) | Three dots: how much evidence stands behind a value | Basis → UI |
| `components/profile/shaped-by.tsx` (218) | What music contributed versus answers | Per-source curves → UI |
| `components/profile/matches.tsx` (186) | Recommendations with reasons, ranges and provenance | `RecommendationsOut` → UI |
| `components/profile/music-section.tsx` (207), `band-emphasis.tsx` (45), `cluster-list.tsx` (81), `key-traits.tsx` (35) | The listening signature, per-band emphasis, clusters, headline traits | `MusicProfileOut` → UI |
| `components/profile/delete-dialog.tsx` (57) | Confirmed account deletion | `DELETE /api/me` |
| `components/tune/sound-shaper.tsx` (249), `question-visual.tsx` (156), `inputs.tsx` (149), `practical-step.tsx` (194) | The live curve beside the questions; accessible radio/scale inputs; budget and gear | Draft answers → preview |
| `components/viz/listening-map.tsx` (153), `sound-field.tsx` (277) | Brightness × energy scatter; the field visualisation | Points → SVG |
| `components/flow/flow-shell.tsx` (124), `use-session.ts` (16) | Shared flow chrome; session guard and redirect | — |
| `components/site/*`, `components/brand/logo.tsx`, `components/ui/*` | Header, footer, reveal-on-scroll, logo, button, error note, spinner | — |
| `lib/bands.ts` (49), `band-tone.ts` (79), `band-stories.ts` (69) | The same nine bands on the client, with colours and plain-language stories | — |
| `lib/evidence.ts` (182) | Turning provenance and basis into words and dots | Profile → labels |
| `lib/scale.ts` (53), `stats.ts` (20), `format.ts` (30), `currency.ts` (79), `portrait.ts` (56), `cn.ts` (6), `youtube.ts` (90), `use-element-size.ts` (22) | Log-frequency mapping, column quantiles, formatting, budgets, portrait geometry, class merging, client-side URL parsing, element measurement | — |
| `lib/*.test.ts` (3 files) | 34 unit tests for evidence wording, portrait maths, URL parsing | — |
| `e2e/onboarding.spec.ts` (70) | 6 browser tests: landing → session → validation → questionnaire → profile → deletion | — |

### 13.10 Configuration, scripts and documentation

| File | Purpose |
| --- | --- |
| `backend/pyproject.toml` | Dependencies, `auralis` CLI entry point, ruff and mypy configuration |
| `backend/alembic.ini`, `backend/migrations/env.py` | Migration configuration |
| `web/next.config.ts` | `/api/*` rewrite to the API, security headers, allowed image host (`i.ytimg.com`), React Compiler |
| `web/package.json` | Frontend dependencies and scripts (`dev`, `build`, `typecheck`, `test`, `test:e2e`, `api:types`) |
| `web/playwright.config.ts` | Desktop + mobile browser test projects |
| `docker-compose.yml` | PostgreSQL for local development |
| `.env.example` | Every environment variable with a safe default; **no secrets** |
| `scripts/dev.py` | Start/stop the whole stack (`up`, `down`, `status`, `logs`) with process-identity tracking |
| `scripts/devdb.py`, `scripts/create-test-db.sql` | Local PostgreSQL lifecycle and test database |
| `Start-Auralis.cmd`, `scripts/Start-Auralis.ps1` | One-click local start |
| `docs/architecture.md`, `docs/decisions.md` | Architecture notes and the decision log |
| `docs/audit-report.md` | The engineering audit with its ten findings |
| `docs/phase2/plan.md`, `research.md`, `methodology.md`, `evaluation.md`, `evaluation.json` | The Phase 2 research, method and evaluation record |
| `.github/` | CI workflow |

---

## 14. Who does what — the two-minute version

```text
Next.js + React      builds every screen and keeps the browser in sync with the API
TanStack Query       caches server state and polls the analysis screen every 1.5 s
motion               animates the spectrum, the records and the transitions
FastAPI              validates requests, enforces ownership, returns typed JSON
Pydantic             defines the contract the frontend's types are generated from
SQLAlchemy + Alembic define and migrate the tables
PostgreSQL           stores everything, and doubles as the job queue
auralis worker       runs downloads and analysis in separate processes
yt-dlp               fetches metadata and a temporary audio file from YouTube
PyAV (FFmpeg)        decodes that audio into raw samples
NumPy + SciPy        measure the spectrum and the loudness
librosa              measures tempo, onsets, percussiveness and MFCC timbre
scikit-learn         groups a library into sonic clusters and flags duplicates
fusion.py            combines music evidence and answers into one Bayesian profile
acoustics/fr.py      puts earphone measurements and targets on one comparable grid
harman.py            scores every earphone against your personal target and explains why
```

---

## 15. Security and engineering

Only implemented protections are listed; gaps follow.

| Area | Implementation | Where |
| --- | --- | --- |
| **Sessions** | 256-bit `secrets.token_urlsafe(32)`; only its SHA-256 hash is stored; HttpOnly, SameSite=Lax, Secure in production; 90-day TTL | `auth/service.py`, `auth/deps.py` |
| **CSRF** | State-changing `/api/` requests must carry `x-auralis-client: web`. A cross-site form post cannot set a custom header, and a cross-origin fetch with one needs a preflight this API never approves | `main.py:CsrfHeaderMiddleware`, `lib/api/client.ts` |
| **Authorisation** | Every query is scoped to the session user; another user's submission returns **404, not 403** | `music/service.py:_owned_submission`; tested |
| **SSRF** | User input is reduced to `(kind, id)` and a canonical URL is rebuilt server-side; yt-dlp is restricted to YouTube extractors; the oEmbed request is built from a validated id | `music/urls.py`, `music/youtube.py`, `music/preview.py` |
| **Input validation** | Pydantic on every endpoint; URL count, track count, duration and byte caps from settings; questionnaire answers validated against the served definition | `config.py`, `music/service.py`, `questionnaire/definition.py` |
| **Secrets** | Only the database URL, from `AURALIS_*` environment variables, typed as `SecretStr`; never sent to the browser; `.env.example` contains no real values | `config.py` |
| **Temporary files** | Downloaded audio lives in a `TemporaryDirectory` that is removed when the analysis returns — including on failure | `music/acquire.py` |
| **Personal data** | Display name and optional preferences only; no email, no password, no audio retained; `DELETE /api/me` cascades and is tested | `profiles/service.py` |
| **Abuse limits** | 20 URLs and 120 tracks per submission, 60 MB and 20 minutes per track, 2 active submissions per user (429 beyond) | `config.py`, `music/service.py` |
| **Transport headers** | `nosniff`, `X-Frame-Options: DENY`, referrer policy, permissions policy; artwork proxied through the image optimiser so browsers never contact YouTube | `web/next.config.ts` |
| **API surface** | OpenAPI and `/api/docs` disabled when `AURALIS_ENV=production` | `main.py` |
| **Error handling** | Domain errors map to stable `{error:{code,message}}` payloads; internal details are never returned; job failures store a reason and retry with backoff | `core/errors.py`, `main.py`, `jobs/worker.py` |

**Known gaps, stated plainly:** there is no rate limiter on session creation or submissions (only per-user caps), no Content-Security-Policy header, no structured logging or error tracking, and no backup/retention policy beyond the 90-day session lifetime. These are listed as findings 6 in `docs/audit-report.md` and should be closed before real users.

---

## 16. Performance

Numbers below were measured on the development machine (16 logical cores) from the application's own stored timings; nothing here is estimated.

| Measurement | Value | Source |
| --- | --- | --- |
| Analysis per song | 7.4 s median, 11.1 s p90 | `track_analyses.analysis_seconds`, n = 396 |
| Download per song | 4.2 s median, 6.8 s p90 | `track_analyses.download_seconds`, n = 396 |
| Full playlist | 113 songs in 6.9 minutes — an effective 3.2 songs at a time | Submission timestamps |
| Recommendations end to end | 456–540 ms for 203 earphones × 256 posterior draws | `docs/audit-report.md` timing run |
| Backend test suite | 139 tests in 42.5 s | `pytest`, this audit |

**The optimisations that are actually implemented:**

- **Process-level concurrency.** Analysis is CPU-bound, so the worker uses processes, not threads (`jobs/worker.py:run_workers`). Concurrency defaults to 3 and is set by `AURALIS_WORKER_CONCURRENCY` — this machine runs 9. Effective parallelism is lower than the process count because decoding contends for the same cores.
- **Analysis caching.** `track_analyses` is keyed by `(track_id, analyzer_version)` and shared across listeners, so a track anyone has already analysed is reused instantly. This is why re-submitting the same playlist completes immediately.
- **Streaming spectral analysis.** `spectral.py` processes frames in chunks of 256, so a ten-minute track costs tens of megabytes rather than hundreds.
- **Bounded work per track.** Ten minutes of audio maximum; rhythm and MFCC analysis on three 30-second excerpts; a 60 MB download cap.
- **Vectorised scoring.** All 256 posterior draws are scored in one NumPy call (`olive_terms` operates on the last axis), which is why personalised ranking of 203 earphones takes half a second.
- **Concurrent metadata resolution.** Playlist resolution uses a thread pool, and the AutoEq importer prefetches with 12 threads.
- **Database-side work.** Job claiming is one `UPDATE … RETURNING` with `SKIP LOCKED`; indexes exist on the hot paths (`submission_tracks(track_id, status)`, job status/run_after).
- **Frontend.** Polling stops the moment a submission settles and never runs in a background tab; the React Compiler handles memoisation; artwork goes through Next's image optimiser; gzip is on for responses above 2 KB.

**Not implemented:** no CDN, no read replicas, no Redis cache, no horizontal scaling, and no load testing has been performed. Deployment has only been rehearsed locally.

---

## 17. How the system is validated

Run with `auralis evaluate`; results in `docs/phase2/evaluation.md` and `evaluation.json` (generated 2026-09-18 against 203 earphones, 288 analysed tracks and 3 anonymous listener libraries).

The honest framing first: **validity against real preference cannot be measured yet**, because nobody has told the system which earphone they actually liked. What can be measured, and is, falls into four groups.

**Is the code correct?** The implementation reproduces AutoEq's published Harman in-ear scores across 203 earphones with **r = 0.9998** and a mean absolute error of **0.24 points** (SD, slope and AAE terms match to 0.003). If the formula had been misread, this number would expose it.

**Is the music representation sound?**

| Question | Result |
| --- | --- |
| Does the reference corpus look like real music? | −4.9 dB/octave spectral decay, against roughly −5 dB/octave reported by Pestana et al. (2013) |
| Does library balance stabilise with more songs? | Sub-bass 90 % interval narrows from 20.0 dB at 5 songs → 8.4 at 10 → 6.3 at 20 → 4.3 at 40 → **2.9 dB at 80** |
| Is it internally consistent? | Split-half correlation 0.976 on a 106-song library; **negative and reported as unusable** on the 20- and 10-song libraries |
| Does music carry any signal at all? | Bass-forward genres differ from acoustic genres by **22.6 dB** in sub-bass, permutation p = 0.0065 |

That second row is the project being honest about itself: for small libraries the split-half reliability came out negative, and the code reports `reliability: null` instead of a flattering number.

**Do the recommendations behave?**

| Question | Result |
| --- | --- |
| Do rankings follow the profile? | Shifting the bass preference from −4 to +6 dB moves the top-10 mean bass level monotonically from −1.71 to +4.21 dB (Spearman 1.0); treble 0.99 |
| Does it agree with the published method when there is no personal evidence? | Kendall τ = **0.957** against AutoEq's published ranking; 82 % top-10 overlap |
| What does each evidence source contribute? | Ablation over three libraries: music alone changes 67–82 % of a top 10 versus the reference; combined versus answers-only changes 43–54 % |
| Does the scoring function matter? | The Olive model and the RMS baseline share only 43–54 % of a top 10 |
| Are the explanations true? | **170 of 170** reasons across 60 recommendations re-derived from the raw curves; zero problems |
| How much do the assumptions matter? | Sweeping each: bass prior 2.0 → 94 % mean top-10 overlap; treble prior 1.5 → 83 %. The rankings are stable but not indifferent |
| How do earphone tunings actually vary? | PCA of 203 error curves: a **bass shelf explains 54.5 %** of the variance and a **broad tilt 16.1 %** — which is why a nine-band preference curve is an adequate representation |

---

## 18. Scientific honesty — what Auralis can and cannot claim

This is the section to read twice before a viva. The inference chain has four links, and they are not equally strong.

```text
 (1) AUDIO MEASUREMENT          measured      very strong
     The spectrum of your songs is measured, not guessed.
              |
 (2) LIBRARY AGGREGATION        derived       strong, with stated uncertainty
     Your library's balance relative to a reference corpus, with a bootstrap interval.
              |
 (3) LISTENING -> PREFERENCE    HYPOTHESIS    the weak link  <-- say this out loud
     That what you listen to says something about the tuning you prefer.
     One parameter, rho = 0.837 by default. No study has measured it.
              |
 (4) TARGET -> RANKING          published model, extended   strong then heuristic
     The Olive in-ear model is published and reproduced exactly (r = 0.9998);
     applying it to a *personalised* target is an extension its authors did not validate.
```

### Can claim

- Every earphone curve used is a **real published measurement**, from a named measurer on a stated rig family, with its source commit and licence stored per row.
- Every audio number is a **direct measurement** of the submitted audio, reproducible from the stored features.
- The **Olive in-ear preference model is implemented correctly** — verified against 203 published scores.
- The personalisation has **no arbitrary fixed weights**; the balance between music and answers follows from named parameters and the evidence present.
- **Uncertainty is carried end to end**: bootstrap intervals on the library, posterior widths on the profile, and an 80 % range on every predicted preference.
- Every explanation shown to a user is **re-derived from the numbers that produced the score** — audited, 170/170.
- **No audio is retained** and no personal data beyond a display name is stored.

### Heuristic or approximation (labelled as such in the code)

- The six descriptors (`warmth`, `energy`, …) are logistic transforms of robust z-scores against a **30-track corpus across 21 genres** — the calibration file itself calls this "provisional" and "small and hand-picked".
- The nine band edges are a **convention**, not a standard.
- Applying the Olive model to a personalised target is an **extension** of a model fitted for average listeners.
- Duplicate detection, outlier weighting and cluster counts use tuned thresholds (distance 0.06, z > 3.0, weight 0.25).

### Research-backed assumption

- Population spread: 3.0 dB bass, 2.5 dB treble (from Harman listener classes and demographic findings); 1.5 dB mids and 2.5 dB air are labelled plain **assumptions**.
- Answer reliability r = 0.70 — a conservative floor for single-item self-report (Wanous et al. 1997), borrowed from another field.
- ρ = √r ≈ 0.837 — a **hypothesis**, chosen so a large library is exactly as informative as one direct answer.

### Cannot claim

- ❌ **"Your music spectrum is your ideal frequency response."** It is not. The music is evidence that shifts a prior through ρ; it is never copied onto the target.
- ❌ "Auralis knows your true hearing preference." It estimates a distribution and shows its width.
- ❌ "Validated against listeners." No listening study has been run. Zero outcome labels exist.
- ❌ "The recommendation is the best earphone for you." It is the highest expected score under a stated model, among 203 measured earphones on one rig family.
- ❌ "Our AI learned your taste." Nothing is trained.
- ❌ Any claim about price or value — there are no prices in the database.

### Future work

A listening study or in-product feedback would turn ρ and r from assumptions into estimates — the code already has a `feedback` evidence source wired into the fusion model (`_feedback_observations`) awaiting data. Beyond that: more measurers once redistribution rights are confirmed, a larger calibration corpus, sourced prices, and a rate limiter plus CSP before real users.

---

## 19. Viva preparation

### 30-second explanation

> Auralis recommends in-ear monitors from evidence instead of opinion. You paste YouTube links to music you like; we measure the actual audio — spectrum, loudness, dynamics, timbre — and aggregate it into a listening signature. Nine short questions refine it. The result is a personal target curve in decibels relative to a published research target, and we score 203 real measured earphones against it, explaining each result from the numbers that produced it.

### One-minute explanation

> The problem is that earphone advice is subjective: the same product is called warm by one reviewer and neutral by another, and a beginner has nothing to connect their own listening to a purchase. Both sides of the problem are actually measurable — audio can be analysed, and earphones have published frequency-response measurements — so Auralis connects them.
>
> A listener submits YouTube links. Workers download each track temporarily, decode it with FFmpeg, and measure it: power per octave in nine bands, BS.1770 loudness, dynamics, stereo width, tempo, onsets and MFCC timbre. The audio is deleted immediately. The library is curated for duplicates and outliers, then aggregated into a per-band deviation from a reference corpus, with a bootstrap confidence interval so small libraries are honestly discounted.
>
> Nine perceptual questions in plain language add self-reported evidence. A Bayesian model combines them: a population prior, music as a conditional prior through one correlation parameter, and answers as noisy observations. There are no fixed weights — the balance follows from the evidence. The posterior becomes a personal target, and the Olive in-ear preference model ranks measured earphones against it, with uncertainty carried through 256 posterior draws.

### Three-minute explanation

> *(Start with the one-minute version, then continue.)*
>
> The architecture is a modular monolith: FastAPI and SQLAlchemy over PostgreSQL, a Next.js frontend whose API client is generated from the backend's OpenAPI schema, and worker processes that use the database itself as a job queue via `FOR UPDATE SKIP LOCKED`. That choice means a job is created in the same transaction as the row it processes, so work is never lost, and there is one fewer service to operate.
>
> The part I would defend hardest is the separation of layers. `features.py` produces only measurements and contains no interpretation. `descriptors.py` does the interpreting and is explicitly labelled heuristic. `aggregate.py` produces derived statistics with uncertainty. `fusion.py` does model inference with every assumption isolated in one file, `assumptions.py`, which also lists the sweep values the evaluation uses. So when someone asks "is that a fact or a guess?", the codebase answers rather than the presenter.
>
> On validation: we cannot yet validate against real preference, because we have no data on which earphone a listener actually liked. What we did validate is everything else. The scoring model reproduces AutoEq's published scores at r = 0.9998 across 203 earphones. The library representation stabilises with more songs — the sub-bass interval narrows from 20 dB at five songs to 2.9 dB at eighty. Different genres separate by 22.6 dB in sub-bass with p = 0.0065. Rankings move monotonically with the profile. With no personal evidence, the ranking matches the published method at Kendall τ = 0.96. And an audit re-derived all 170 explanation strings from the raw curves.
>
> The honest weak point is the link between what you listen to and what you want to hear. No published study measures it. Rather than hide that, it is a single parameter, ρ, defaulting to 0.837, and the evaluation sweeps it from −0.837 to 0.95 so you can see exactly how much of the result depends on it. That is the design principle of the whole project: uncertain things are named, isolated and measured, not smoothed over.

### Questions and answers

**Foundations**

1. **What problem does Auralis solve?** Earphone advice is subjective and disconnected from what a person actually listens to. Auralis derives a personal target curve from measurable evidence and ranks real measured earphones against it.
2. **Why music analysis rather than a taste quiz?** A quiz is a single noisy self-report in engineering language most listeners do not speak. The library is behavioural evidence, it is large, and it is measurable. Auralis uses both — the quiz refines, it does not lead.
3. **Why frequency-domain features?** Because the thing being recommended is described in the frequency domain. An earphone's defining property is its frequency response, so the listener side has to speak the same language: power per octave in the same nine bands.
4. **What is a frequency response?** The output level of a device as a function of frequency, measured on a standardised fixture. For an IEM it is measured in an ear simulator and shows how much of each frequency reaches the eardrum relative to the rest.
5. **What is the Harman in-ear target?** A research-derived target curve for in-ear headphones, produced from listener preference studies, defined on an IEC 60318-4 ear simulator. It is our reference point — a personal target is that curve plus the listener's estimated offsets.
6. **What is spectral centroid?** The magnitude-weighted mean frequency of the spectrum — the "centre of gravity" of the sound. Higher means brighter. It drives our `brightness` descriptor.
7. **What is RMS / how do you measure loudness?** We do not use naive RMS. We implement ITU-R BS.1770: a K-weighting filter chain, 400 ms blocks, absolute and relative gating, producing integrated LUFS — the broadcast standard for perceived loudness — plus EBU Tech 3342 loudness range.
8. **What is MFCC?** Mel-frequency cepstral coefficients: the spectrum mapped onto a perceptual mel scale, log-compressed, then decorrelated with a DCT. The first coefficients summarise the spectral envelope — the timbre "fingerprint". We compute 20 of them.
9. **Where are MFCCs used?** Similarity only: duplicate detection and sonic clustering in `curation.py`. They are deliberately **not** used as tonal-preference evidence, because a cepstral coefficient does not map to "wants more bass".
10. **What is spectral flatness?** Geometric mean divided by arithmetic mean of the power spectrum. Near 1 means noise-like, near 0 means tonal. It feeds the `density` descriptor.
11. **What is HPSS?** Harmonic/percussive source separation — it splits a spectrogram into sustained and transient parts. We use the percussive share as an energy indicator.
12. **Why power per octave instead of raw band energy?** Because bands have different widths. Normalising per octave means pink noise reads 0 dB in every band, so the numbers are comparable across bands and against the reference corpus.
13. **Why normalise at 500 Hz?** Level is not tone. Aligning both the measurement and the target at 500 Hz removes differences in overall loudness so only the shape is compared — the same convention the measurement community uses.

**The model**

14. **Why can't you just equate your music's spectrum with your ideal earphone curve?** Because they are different things. A track's spectrum reflects production and genre conventions, not the listener's preferred playback tuning. A mix that is already bass-heavy might mean you like bass — or that you would want less of it added. Auralis treats music as *evidence that shifts a prior*, scaled by ρ, never as the target itself.
15. **So how does the questionnaire help?** It provides direct, if noisy, self-report about preference — the quantity we actually want. Nine questions in listener language, each with a "not sure" option that contributes nothing.
16. **How are music and answers combined?** A Gaussian Bayesian model. Population prior N(0, σ²); music shifts it to N(ρσẑ, σ²(1−ρ²)+(ρσ·SE)²); each answer is an observation with variance σ²(1−r)/r; the posterior is the precision-weighted combination.
17. **What are the weights between music and questionnaire?** There are none. The influence of each source emerges from ρ, the answer reliability r, and the evidence actually available through the bootstrap SE. Someone with 100 consistent songs gets a music-led profile; someone with six songs gets an answer-led one.
18. **What is ρ and where does 0.837 come from?** ρ is the assumed correlation between library balance and preferred balance. 0.837 is √0.70, chosen so a large library carries exactly as much information as one direct answer. It is a **hypothesis**, marked as such, and the evaluation sweeps it.
19. **Is your model trained?** No. Nothing is fitted to data we collected. The one fitted model in the system is the published Olive regression, fitted by its authors on listener panels and used as published.
20. **Then where is the machine learning?** Classical unsupervised ML — K-means, PCA and silhouette scoring — groups a library into sonic clusters and detects duplicates. Everything else is deterministic signal processing, statistical estimation, or Bayesian inference. We would rather say that than inflate it.
21. **Why no deep learning?** Supervised learning needs labels: which earphone a listener actually preferred. We have zero. A neural network trained on nothing would be decoration. The architecture isolates every assumed parameter in one file so a fitted model can replace them when data exists.
22. **How does the recommendation work?** Personal target = Harman reference + your posterior offsets, interpolated in log-frequency. Error = measured response − target, both aligned at 500 Hz. That error is scored by the Olive model. 256 seeded posterior draws give an expected score and an 80 % range, and results are ranked by the expected score.
23. **What is the Olive scoring formula?** `100.0795 − 8.5·SD − 6.796·|slope| − 3.475·AAE`, over the ISO R40 grid from 20 Hz to 10 kHz: SD is the unevenness of the error, slope its tilt against log-frequency, AAE its average magnitude after aligning at 500 Hz.
24. **Is this content-based or collaborative?** Purely content-based. Collaborative filtering needs many users' outcomes; we have none, and inventing them would be dishonest.
25. **How do you handle uncertainty in the recommendation?** By sampling. The profile is a distribution, so we score 256 draws from it and report the mean with the 10th and 90th percentiles. A vague profile produces a visibly wide range.
26. **Why 256 draws and why seeded?** Enough for a stable mean and percentiles at half a second per request; seeded from a hash of the profile so the same profile always yields the same ranking — reproducibility matters more than novelty here.
27. **How are explanations generated?** From the error curve that produced the score, region by region, after scoring. The code compares each region's mean error against a tolerance derived from the listener's own posterior width and labels it within/above/below/unreliable. We audited 170 reasons and re-derived all of them.
28. **Why is anything above 10 kHz marked unreliable?** IEC 60318-4 couplers are only specified to 10 kHz, and the preference model was fitted to that range. Reporting a confident fit at 16 kHz would be inventing precision.

**Data and engineering**

29. **Where does the earphone data come from?** The AutoEq project, pinned to commit `7ae0f56d…`, importing only oratory1990's in-ear measurements made on GRAS IEC 60318-4 ear simulators. 203 earphones, 211 measurements. Every row stores its source, path, rig, licence and retrieval time.
30. **Why only one measurer?** Because a target curve is only valid on the fixture family it was defined on. Mixing rigs would produce numbers that look comparable but are not. The importer refuses other rig families.
31. **Why is the budget filter inert?** There are no prices in the database, because we have not found a set we can source properly. The importer refuses a price without a source URL and an observation date. Unknown prices are flagged, never silently excluded.
32. **What database and why?** PostgreSQL. Relational integrity for the profile chain, JSONB for feature blobs, and `FOR UPDATE SKIP LOCKED` so the same database can be the job queue — no Redis or Celery to operate, and jobs commit with the rows they belong to.
33. **How do background jobs work?** Three handlers — ingest, analyze_track, build_profile. Workers claim one job at a time with `SELECT … FOR UPDATE SKIP LOCKED` plus `UPDATE … RETURNING`, heartbeat while running, retry with exponential backoff, and stale jobs are requeued if a worker dies.
34. **What happens if a song fails?** The failure is recorded with a reason code (`video_unavailable`, `decode_failed`, `too_short`, `silent`, …), shown in the UI, and excluded from the profile. Nothing is substituted. About 8 % of analyses fail, almost all unavailable videos.
35. **Do you store people's audio?** No. It exists in a temporary directory for the duration of one analysis and is deleted when that block exits, including on failure. Only the derived numbers persist.
36. **What personal data do you hold?** A display name and optional preferences — budget, currency, gear, experience. No email, no password. `DELETE /api/me` cascades through every personal table and is covered by a test.
37. **How do you prevent SSRF through yt-dlp?** User input never reaches yt-dlp. It is parsed into a `(kind, id)` pair and a canonical YouTube URL is rebuilt server-side, with extraction restricted to YouTube extractors.
38. **How is the API secured?** Session cookie (HttpOnly, SameSite=Lax, Secure in production) holding a 256-bit token stored only as a SHA-256 hash; a custom-header CSRF check on state-changing requests; every query scoped to the session user; cross-user access returns 404.
39. **How do frontend and backend stay in sync?** The TypeScript client is generated from the backend's OpenAPI schema. Remove a field server-side and `tsc` fails in CI rather than the page breaking in a browser.
40. **How is it tested?** 139 backend tests including PostgreSQL integration, 34 frontend unit tests, and 6 Playwright browser tests on desktop and mobile — all passing as of this audit. Plus `auralis evaluate`, which is a scientific evaluation rather than a test suite.
41. **How fast is it?** 7.4 s median analysis plus 4.2 s download per song; a 113-song playlist in 6.9 minutes with 9 worker processes; recommendations in about half a second for 203 earphones.
42. **What happens with an unusual listening library?** Two protections. Outliers are down-weighted rather than allowed to dominate, and an inconsistent library produces a large bootstrap SE, which widens the music prior's variance so it counts for less. A genuinely unusual but consistent library will simply produce an unusual target — which is the point.
43. **What if there isn't enough listening data?** The interval widens and the music evidence loses influence automatically; the profile leans on answers and the population prior. The UI labels each dimension with how much evidence stands behind it. Below about 10 songs the evaluation shows the representation is not yet reliable, and we say so.
44. **What are the main limitations?** No validation against real listener preference; ρ and r are unvalidated; one measurer and one rig family; no prices; a 30-track calibration corpus; descriptors are heuristic; no rate limiting or CSP yet; deployment only rehearsed locally.
45. **What would you do next?** Collect outcome data — a listening study or in-product feedback. The fusion model already accepts a feedback evidence source; it is waiting for data. That would turn ρ and r from assumptions into estimates and make a genuine validation possible.

### Trick questions — where the right answer is an admission

- **"So Auralis uses AI to learn my taste?"** — No. Nothing is trained. It measures audio deterministically and combines it with your answers in a Bayesian model whose parameters come from literature or are labelled assumptions.
- **"Your spectrum analysis tells you the exact earphone I need."** — It does not. It produces a distribution over preferred offsets, and a ranked list with an uncertainty range, among the 203 earphones we have measurements for.
- **"Prove that people who listen to bassy music want bassy earphones."** — I cannot, and neither can the literature. That link is the hypothesis ρ. We default it to 0.837 and sweep it from −0.837 to 0.95 in the evaluation so you can see its effect. Measuring it is the next piece of work.
- **"Is the predicted preference score a real rating?"** — It is the output of a published regression model fitted on listener panels against the reference target. Against a *personalised* target it is an extension its authors never validated, and we label it as such.
- **"Your descriptors say my music is 0.73 warm — what does that mean?"** — It means one robust standard deviation above a 30-track reference corpus, after a logistic transform. It is a transparent heuristic, not a validated perceptual measure, and the corpus is small.
- **"Why is there no accuracy figure?"** — Because accuracy requires ground truth and we have none. Quoting an accuracy number would be fabricating it. What we can quote is implementation correctness (r = 0.9998), stability, sensitivity and explanation consistency.
- **"Can you recommend the best earphone under $100?"** — Not today. The database has no prices; the budget filter is implemented but inert, and unknown prices are flagged rather than silently dropped.
- **"Does it work for any music?"** — For anything YouTube will serve that is 30 seconds to 20 minutes long and not deliberately altered. Lossy sources cap the measurable "air", and those bands are excluded from taste inference rather than being trusted.

---

## 20. The project in one page

**PROJECT** — Auralis: evidence-based in-ear monitor recommendation from your own music.

**PROBLEM** — Earphone advice is subjective and disconnected from what a listener actually hears. Both sides are measurable; nothing connected them.

**INPUT** — YouTube links (up to 20 URLs / 120 tracks), nine optional perceptual answers, optional budget and gear.

**PROCESSING** — Temporary download (yt-dlp) → decode (PyAV) → measure (NumPy/SciPy/librosa: nine-band power per octave, BS.1770 loudness, dynamics, width, tempo, onsets, MFCC) → curate (duplicates, outliers, K-means clusters) → aggregate (weighted median deviation vs a reference corpus, 400-sample bootstrap interval) → fuse with answers (Gaussian Bayesian posterior) → score earphones (Olive in-ear model over 256 posterior draws) → explain from the same error curve.

**AI / ML** — No trained model. Deterministic DSP + classical MIR + unsupervised clustering (scikit-learn) + Bayesian inference + one published regression model. Stated plainly rather than dressed up.

**OUTPUT** — A personal sound profile: eleven dimensions with credible intervals, a nine-band preference curve in dB versus the Harman in-ear 2019 target, and ranked earphones with per-region reasons, predicted-preference ranges and measurement provenance.

**CORE TECHNOLOGIES** — FastAPI · SQLAlchemy 2 · PostgreSQL 18 · Alembic · yt-dlp · PyAV · NumPy · SciPy · librosa · scikit-learn · Next.js 16 · React 19 · TypeScript · Tailwind 4 · TanStack Query · motion.

**KEY FILES** — `analysis/features.py` (measure) · `analysis/aggregate.py` (library) · `sound_profile/fusion.py` (the model) · `sound_profile/assumptions.py` (every assumption) · `acoustics/fr.py` (curves + Olive score) · `recommend/harman.py` (ranking + reasons) · `music/pipeline.py` (jobs) · `jobs/queue.py` (the queue) · `app/analysis/[id]/page.tsx` (the live screen).

**KEY ALGORITHMS** — Streaming STFT with activity gating · ITU-R BS.1770 K-weighted loudness · MFCC timbre · K-means/PCA curation · weighted median with seeded bootstrap · Gaussian conditional prior + precision-weighted posterior · Olive in-ear preference regression `100.0795 − 8.5·SD − 6.796·|slope| − 3.475·AAE`.

**KEY LIMITATION** — The link between what you listen to and what you prefer is an unvalidated hypothesis (ρ = 0.837). No listening study has been run, so no accuracy figure exists. Also: one measurer, one rig family, no prices.

**FUTURE IMPROVEMENT** — Collect listener feedback (the fusion model already has the input wired) to estimate ρ and answer reliability from data, enabling genuine validation; then more measurers, a larger calibration corpus, sourced prices, and rate limiting plus a CSP before real users.

**HEADLINE NUMBERS** — 203 earphones · 211 measurements · 17 tables · 17 endpoints · 139 + 34 + 6 tests passing · scoring reproduces published values at r = 0.9998 · explanations audited 170/170.

---

## Appendix A — verification log

Everything in this report was checked against the repository on 2026-09-30.

| Check | Method | Result |
| --- | --- | --- |
| File paths | `find` over `backend/src` and `web/src` | 76 backend + 69 frontend files enumerated; every path named here exists |
| Functions and classes | AST/grep inventory of every `def`/`class` | Every symbol named here was located in the file it is attributed to |
| Endpoints | grep of `@router.*` plus `main.py` | 17 endpoints; table matches the code |
| Technologies | Import analysis across `backend/src` and `web/package.json` | librosa (features only), scikit-learn (curation only), scipy, soxr, PyAV confirmed in use; **no torch/tensorflow/LLM client anywhere** |
| Database | `information_schema.tables` on the running database | 17 domain tables + `alembic_version` |
| Model claims | Read `fusion.py`, `assumptions.py`, `harman.py`, `fr.py` | Formulas quoted from source; ρ default computed as √r in code |
| Tests | `pytest`, `vitest run`, `playwright test` executed | 139 / 34 / 6 passing |
| Evaluation figures | `docs/phase2/evaluation.json` | All quoted numbers taken from that file |
| Performance figures | SQL over `track_analyses` and submission timestamps | Medians and p90 recomputed during this audit |
| Counts of catalogue data | SQL counts | 203 IEMs, 211 measurements, 2 targets, 422 profiles, **0 prices** |

**Could not be verified from the repository:** whether the AutoEq redistribution terms permit any use beyond non-commercial research with attribution (the importer records the assumption rather than a confirmation); any claim about real listener preference accuracy (no outcome data exists); and deployment behaviour beyond this machine (never rehearsed elsewhere).

## Appendix B — implementation versus the original plan

| Planned | Implemented | Note |
| --- | --- | --- |
| A trained ML model for preference | Bayesian model with literature-based priors | Deliberate: no labelled outcome data exists. `assumptions.py` is the seam where a fitted model would attach |
| Fixed weighting of music versus questionnaire | No fixed weights | The balance emerges from ρ, r and the evidence, and was an explicit project requirement |
| Prices and budget filtering | Filter implemented, no price data | The importer refuses unsourced prices, so the feature is inert rather than fabricated |
| Redis/Celery-style queue | PostgreSQL queue with `SKIP LOCKED` | Recorded in `jobs/__init__.py`: transactional job creation, one less service |
| Multiple measurement sources | One measurer, one rig family | Mixing rigs would invalidate target comparison |
| A charting library | Hand-written SVG components | Full control over the visual language; no extra dependency |

Every difference above is a decision that is written down in the code or in `docs/decisions.md`, not an accident.
