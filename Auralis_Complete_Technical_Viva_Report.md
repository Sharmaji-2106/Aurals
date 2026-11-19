# Auralis

## Complete Technical and Viva Preparation Report

**Repository inspected:** `G:\Auralis`  
**Report generated:** 2026-09-30  
**Primary evidence:** current source code, migrations, configuration, tests, checked-in documentation, and the dated audit/evaluation artifacts in `docs/`.  
**Verification rule:** when a claim cannot be established from the repository, it is marked **Not verified from codebase.**

> This is a team-facing engineering report. It explains what the current implementation does, what it does not do, why the design was chosen, and how to defend it honestly in a demonstration or viva.

## Table of contents

1. [Project overview](#1-project-overview)
2. [Complete technology stack](#2-complete-technology-stack)
3. [Architecture](#3-architecture)
4. [End-to-end data flow](#4-end-to-end-data-flow)
5. [Music and audio pipeline](#5-music-and-audio-pipeline)
6. [AI and machine learning](#6-ai-and-machine-learning)
7. [Personal sound profile](#7-personal-sound-profile)
8. [IEM and headphone data](#8-iem-and-headphone-data)
9. [Recommendation engine](#9-recommendation-engine)
10. [Why the technologies were chosen](#10-why-the-technologies-were-chosen)
11. [Research foundation](#11-research-foundation)
12. [Scientific limitations](#12-scientific-limitations)
13. [Security and privacy](#13-security-and-privacy)
14. [Performance and scalability](#14-performance-and-scalability)
15. [Live demonstration script](#15-live-demonstration-script)
16. [Viva questions and answers](#16-viva-questions-and-answers)
17. [Trick questions](#17-trick-questions)
18. [30-second, 1-minute, and 3-minute explanations](#18-30-second-1-minute-and-3-minute-explanations)
19. [Final viva cheat sheet](#19-final-viva-cheat-sheet)
20. [Evidence and code map](#20-evidence-and-code-map)

## Verification boundary

The repository contains the application code and the methodology/evaluation documents. The PostgreSQL database, imported AutoEq files, and the downloaded YouTube cache are not committed to the repository. Therefore:

- The implementation and schema descriptions below are verified from code.
- The dataset counts and benchmark timings are reported as the dated `docs/audit-report.md` snapshot from 2026-09-28, not as a fresh database query from this clean repository.
- The evaluation results in `docs/phase2/evaluation.md` are treated as checked-in project evidence; they cannot be independently regenerated without the external data/cache.
- No claim below says that the recommender has been proven correct for real users. The project documentation explicitly says that real user–IEM outcome data is still missing.

# 1. Project overview

## What Auralis is

Auralis is a personal-audio web application. It analyses music that a listener supplies through YouTube links, converts that music into an interpretable acoustic representation, combines that evidence with a perceptual questionnaire, and creates a versioned personal sound profile. It then compares that profile against measured in-ear monitor (IEM) frequency responses and returns ranked, explainable matches.

The current implementation is not a generic chatbot, a Spotify recommender, or a trained deep-learning system. Its central path is a transparent signal-processing and statistical-modeling pipeline:

```text
listener
  -> validated YouTube video/playlist IDs
  -> metadata resolution and track selection
  -> temporary audio download
  -> PyAV decode to stereo 44.1 kHz PCM
  -> measured audio features
  -> duplicate/outlier/cluster curation
  -> music-profile/2 library representation
  -> questionnaire answers
  -> sound-profile/3 Bayesian fusion in dB
  -> personal target = Harman IE 2019 + posterior offsets
  -> measured IEM curves on the same rig family
  -> harman-personal/1 scoring and ranking
  -> computed explanations returned to the UI
```

## Problem it addresses

Choosing an IEM is difficult because:

- product names and marketing descriptions do not describe a listener's actual tonal preference;
- frequency-response graphs are technical and difficult for many users to interpret;
- a listener may be unable to describe sound preferences using audio-engineering terms;
- existing population-level preference targets do not fully represent individual variation;
- a recommendation without evidence is difficult to trust.

Auralis tries to make the listener's own music the starting evidence, then lets the questionnaire refine what music alone cannot reveal, such as treble tolerance, soundstage priority, and naturalness.

## Intended user

The intended user is a listener considering an IEM and willing to provide a small music library through public or unlisted YouTube links and answer plain-language sound-preference questions. The user does not need to know terms such as spectral centroid, Harman target, or MFCC.

## What is different about the approach

The distinctive design choices visible in the current code are:

1. **Behavioural music evidence:** the system measures the audio the user actually submits instead of beginning only with a generic questionnaire.
2. **Interpretable representation:** the matching path uses frequency-band deviations in dB rather than an opaque learned embedding.
3. **Uncertainty:** the library has bootstrap uncertainty, and the personal profile has posterior standard deviations and an 80% range.
4. **Explicit assumptions:** the music-to-preference relationship is represented by a named correlation parameter `music_correlation`; it is documented as a hypothesis, not a fact.
5. **Measurement provenance:** raw IEM frequency-response points, checksum, source, rig, variant, licence note, and source reference are stored separately from derived representations.
6. **Traceable explanations:** reasons are produced from the same per-region errors used for ranking.

## Complete current user journey

1. The visitor opens the Next.js web app and chooses a display name.
2. The frontend calls `POST /api/session`; the backend creates an anonymous user, a profile, and a hashed-token browser session.
3. The user pastes YouTube video or playlist links on `/music`.
4. The frontend validates the links for preview and submits the raw list to `POST /api/music/submissions`.
5. The backend stores only validated `(kind, external_id)` source records, not arbitrary URLs.
6. A PostgreSQL-backed worker resolves source metadata, filters and samples tracks, and schedules analysis jobs.
7. Each uncached selected track is downloaded temporarily, decoded, analysed, stored as JSON features, and deleted from disk.
8. The worker aggregates the user's successful analysed tracks into an immutable `music_profiles` row.
9. The UI polls the submission and shows progress, failed/skipped reasons, spectra, and a forming music signature.
10. The user answers the questionnaire at `/tune`. Draft answers are previewed through `POST /api/sound-profile/preview` without being stored.
11. Final answers are stored append-only through `POST /api/questionnaire/responses`, and a new immutable `sound_profiles` row is built.
12. The profile page shows the music-only, answers-only, and combined sound curves, dimensions, evidence language, clusters, and music measurements.
13. `GET /api/recommendations` loads the latest profile, the Harman target, eligible IEM measurements, and any known prices.
14. The recommender filters by rig family and applicable budget, scores the remaining IEMs against posterior draws of the personal target, ranks them, and returns regional reasons plus measurement provenance.

The current UI routes are `/`, `/start`, `/music`, `/analysis/[id]`, `/tune`, `/profile`, and `/method`.

# 2. Complete technology stack

| Technology / library | Purpose | Where used | Why it was chosen / problem solved |
|---|---|---|---|
| Python 3.12–3.13 | Backend language | `backend/src/auralis` | Strong scientific/audio ecosystem and clear numerical code. |
| FastAPI | HTTP API | `auralis/main.py` and routers | Typed request/response handling, OpenAPI generation, dependency injection, and async-friendly web serving. |
| Pydantic 2 | Validation and API/data schemas | `schemas.py`, feature/profile models | Rejects malformed inputs and gives a typed contract shared with the frontend. |
| pydantic-settings | Environment configuration | `config.py` | Keeps database URL, limits, worker settings, and environment outside source code. |
| Uvicorn | ASGI server | local/run commands | Runs the FastAPI application. |
| SQLAlchemy 2 | ORM and database access | `db.py`, all ORM models/services | Maps domain models to PostgreSQL and supports transactional queries. |
| PostgreSQL 17/18 in project configs/audit | Database and job queue | migrations and `docker-compose.yml` | JSONB suits versioned feature/profile documents; row locking and partial indexes support the worker queue. Exact production version is **Not verified from codebase**. |
| Alembic | Schema migrations | `backend/migrations` | Makes database schema changes reproducible. |
| Next.js 16 App Router | Frontend framework and same-origin proxy | `web/src/app`, `next.config.ts` | Route-based React application, server proxy for `/api/*`, and production build support. |
| React 19 | UI | all `.tsx` components | Component-based interactive journey. |
| TypeScript | Frontend language | all frontend code | Catches API/UI type mismatches before runtime. |
| Tailwind CSS 4 | Styling | `globals.css`, component class names | Fast consistent UI styling without a separate component CSS system. |
| Motion | Animation | visual and flow components | Provides transitions and reduced-motion-aware interaction. |
| TanStack Query | Server-state fetching, polling, cache invalidation | `web/src/lib/api/hooks.ts` | Handles submission progress polling and profile/recommendation refreshes. |
| openapi-fetch + openapi-typescript | Typed frontend API client | `web/src/lib/api/client.ts`, generated `schema.d.ts` | Keeps frontend request paths and response types aligned with FastAPI OpenAPI. |
| Radix UI slider | Accessible slider control | questionnaire/tuning UI | Provides an accessible interactive scale. |
| lucide-react | Icons | frontend components | Lightweight icon set. |
| Vitest | Frontend unit tests | `web/*.test.ts` | Tests parsing, evidence labels, scales, and helpers. |
| Playwright | Browser end-to-end tests | `web/e2e` | Tests the onboarding flow against a running stack. |
| yt-dlp | YouTube metadata and audio acquisition | `music/youtube.py` | Handles YouTube extraction while the application restricts it to YouTube extractors. |
| PyAV / bundled FFmpeg | Audio decoding and resampling | `analysis/decode.py` | Decodes diverse media formats without requiring a system FFmpeg installation. |
| NumPy | Arrays, statistics, vectorised DSP | all analysis/acoustic/recommend modules | Efficient numerical operations. |
| SciPy | FFT, filters, statistics | `analysis/spectral.py`, `analysis/loudness.py` | Provides FFT, IIR filtering, and numerical routines. |
| librosa | MIR features | `analysis/features.py` | Beat/tempo, onset, HPSS, mel spectrogram, and MFCC extraction. |
| soxr | Rhythm-analysis resampling | `analysis/features.py` | High-quality conversion to 22,050 Hz for librosa rhythm/timbre work. |
| scikit-learn | Classical statistical learning | `analysis/curation.py`, evaluation | KMeans clustering, PCA, and silhouette scoring. No supervised recommender is trained. |
| ThreadPoolExecutor | Bounded parallel network work | source resolution, AutoEq prefetch | Reduces latency for independent YouTube metadata requests and dataset fetches. |
| PostgreSQL job queue | Background processing | `jobs/*.py` | Avoids adding Redis/Celery; jobs, status, retries, dedupe, and heartbeats share the same database. |
| In-memory link-preview cache | Short-lived preview cache | `music/preview.py` | Avoids repeated metadata requests during typing/preview. It is process-local, not a distributed cache. |
| AutoEq pinned commit | External IEM/target source | `iem/datasets.py` | Provides reproducible Harman target and oratory1990 measurement import. |
| Reported research formulae | Acoustic preference model | `acoustics/fr.py`, `recommend/harman.py` | Reuses the published Olive et al. in-ear model rather than inventing a trained model. |
| Ruff, mypy, pytest | Backend quality checks | `pyproject.toml`, CI | Formatting, linting, static typing, and tests. |
| GitHub Actions | CI definition | `.github/workflows/ci.yml` | Runs backend and frontend checks in the repository configuration. CI execution status for this uncommitted repository is **Not verified from codebase**. |

### Important technologies explicitly not present in the matching path

- No PyTorch, TensorFlow, Transformers, MERT, CLAP, or other pretrained music embedding package is a backend dependency.
- No generative AI model is called by the application.
- No supervised recommender is trained because no labelled user–IEM outcome table exists.
- No Redis, Celery, Kafka, or separate queue broker is used.
- No exchange-rate service is used; budgets remain in the user's currency.
- No review-scraping or review-intelligence module is implemented.

# 3. Architecture

## High-level architecture

```text
┌─────────────────────┐
│ Browser / Next.js   │
│ React + TypeScript  │
└──────────┬──────────┘
           │ same-origin /api/* rewrite
           ▼
┌─────────────────────┐
│ FastAPI application │
│ auth, music, profile│
│ questionnaire, rec │
└─────┬───────────────┘
      │ SQLAlchemy
      ▼
┌───────────────────────┐        ┌──────────────────────┐
│ PostgreSQL             │◄──────►│ auralis worker       │
│ domain rows + JSONB    │ jobs  │ ingest/analyse/build  │
│ jobs queue             │        └──────────┬───────────┘
└───────────────────────┘                   │
                                            ▼
                                ┌────────────────────────┐
                                │ yt-dlp + PyAV + NumPy  │
                                │ SciPy + librosa + soxr │
                                └────────────────────────┘
```

The project is a **modular monolith**: one Python package contains API routes, worker handlers, analysis, profile modeling, IEM processing, and recommendation code. The worker is a separate process, but it uses the same package and PostgreSQL database.

## Frontend layer

The frontend is a Next.js 16 App Router app. Its responsibilities are:

- render the onboarding and profile journey;
- parse and preview YouTube links before submit;
- send state-changing requests with `x-auralis-client: web` for CSRF protection;
- poll active submissions every 1.5 seconds through TanStack Query;
- display data returned by the API, including spectra, evidence, uncertainty ranges, and recommendation reasons;
- proxy `/api/*` to the backend so the browser sees one origin and the backend URL is not exposed to browser code.

The visual components use a shared log-frequency axis from 20 Hz to 20 kHz and nine canonical bands. Some landing-page visuals use generated illustrative curves; the actual analysis/profile pages render values from API data. The landing illustration is not an analysis result.

## API layer

`auralis.main.create_app()` configures FastAPI, GZip compression, CSRF-header middleware, validation/domain error handlers, and the health endpoint. Routers are included for account, music, questionnaire, sound profile, and recommendations.

### Current API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Database connectivity check. |
| POST | `/api/session` | Create anonymous account and session. |
| GET | `/api/session` | Read optional current session. |
| GET | `/api/me` | Read current account, profile, and journey state. |
| PATCH | `/api/me/profile` | Update display name/country/currency/budget/experience/gear. |
| DELETE | `/api/me` | Delete personal account data. |
| POST | `/api/music/submissions` | Validate URLs, create a submission, enqueue ingestion. |
| GET | `/api/music/submissions` | List user's submissions. |
| GET | `/api/music/submissions/{submission_id}` | Read progress, sources, tracks, live spectra, and failure reasons. |
| GET | `/api/music/profile` | Read latest derived music profile. |
| GET | `/api/music/link-preview` | Preview one validated YouTube source. |
| GET | `/api/questionnaire` | Return versioned questionnaire definition. |
| GET | `/api/questionnaire/responses/latest` | Read latest answers for prefill. |
| POST | `/api/questionnaire/responses` | Validate/store answers and rebuild sound profile. |
| GET | `/api/sound-profile` | Read latest personal sound profile. |
| POST | `/api/sound-profile/preview` | Fuse draft answers without storing them. |
| GET | `/api/recommendations?limit=...` | Return ranked, explained IEM recommendations. |

## Backend modules

| Module | Main responsibility | Key interactions |
|---|---|---|
| `auralis.music` | URL parsing, YouTube access, selection, submission service, job handlers | Calls jobs, analysis, database. |
| `auralis.jobs` | PostgreSQL queue, claiming, retries, heartbeats, stale recovery | Runs music handlers. |
| `auralis.analysis` | Decode, loudness, spectral analysis, features, descriptors, curation, aggregation | Pure numerical layer; does not import HTTP/database. |
| `auralis.acoustics` | Canonical bands and FR processing | Used by IEM importer and recommender. |
| `auralis.sound_profile` | Bayesian fusion and assumptions | Reads music profile/questionnaire; outputs target offsets. |
| `auralis.iem` | IEM entities, raw measurements, target import, catalogue import | Persists provenance and derived FR profiles. |
| `auralis.recommend` | Candidate loading, constraints, scoring, explanations | Reads sound profile and IEM data. |
| `auralis.questionnaire` | Question definition, validation, response persistence | Feeds sound profile. |
| `auralis.auth` / `profiles` | Anonymous sessions, profile settings, deletion | Scopes all user-owned queries. |

## Database and storage model

The migrations define these principal tables:

| Group | Tables | Meaning |
|---|---|---|
| Identity | `users`, `sessions`, `profiles` | Anonymous listener and preferences. |
| Input | `music_submissions`, `submission_sources`, `submission_tracks`, `tracks` | A user's submitted links and selected tracks. |
| Analysis | `track_analyses` | Versioned shared derived audio analyses, including cached failures. |
| Profile | `music_profiles`, `questionnaire_responses`, `sound_profiles` | Immutable/append-only evidence and fused outputs. |
| IEM | `iems`, `fr_measurements`, `fr_targets`, `iem_acoustic_profiles`, `iem_price_observations` | Product identity, raw FR, target curves, derived acoustics, dated prices. |
| Work | `jobs` | Queue state, attempts, locks, dedupe keys, heartbeats. |

Most rich derived documents are JSONB. Raw FR points are also retained in JSONB, with SHA-256 checksum and provenance columns. The design keeps raw evidence beside versioned derived representations so a later algorithm can rebuild without re-downloading audio or altering old snapshots.

# 4. End-to-end data flow

The following traces a real submission through the implementation. The relevant code names are included so a team member can open the exact module during a viva.

| Step | Input | Processing | Output | Code / why necessary |
|---|---|---|---|---|
| 1. Start account | Display name | `create_user()` creates `users` and `profiles`; `create_session()` creates random token and stores only SHA-256 hash. | HttpOnly session cookie and `MeOut`. | `profiles/router.py`, `auth/service.py`; gives the user an owner for personal data. |
| 2. Enter music | Text lines containing YouTube links | Frontend parses for preview; backend `parse_youtube_url()` accepts only supported YouTube hosts/schemes/IDs. | `YouTubeRef(kind, id, playlist_hint)`. | `music/urls.py`; prevents unsupported URLs and reduces SSRF surface. |
| 3. Create submission | List of raw URLs | `create_submission()` validates max 20 sources, active submission limit, creates canonical `submission_sources`, and enqueues `music.ingest`. | `MusicSubmission` in `queued` state. | `music/service.py`, `music/router.py`; makes processing asynchronous. |
| 4. Resolve source | Canonical video/playlist IDs | `yt-dlp` uses metadata-only extraction, YouTube-only extractors, bounded playlist size, and classifies errors. Sources resolve concurrently. | `TrackMeta` candidates and source status. | `music/youtube.py`, `music/pipeline.py`; discovers track metadata without downloading every item. |
| 5. Select tracks | Candidate metadata | Drops exact repeats, duration violations, unavailable/live/altered uploads, duplicate title keys, and evenly samples large playlists. | selected/skipped `submission_tracks`. | `music/selection.py`; protects representativeness and resource limits. |
| 6. Reuse or enqueue analysis | Selected tracks | Looks up `track_analyses` by `track_id + analyzer_version`; successful analysis is reused, permanent failures are reused, uncached tracks enqueue `music.analyze_track`. | Work queue state. | `music/pipeline.py`; shared cache prevents repeat downloads and analysis. |
| 7. Acquire audio | YouTube video ID | `download_audio()` downloads best audio-only stream into `TemporaryDirectory`, max 60 MB and 20 min. | Temporary file and metadata. | `music/acquire.py`, `music/youtube.py`; bounds abuse and disk use. |
| 8. Decode | Temporary audio file | PyAV opens first audio stream, resamples to stereo float32 44,100 Hz, duplicates mono through stereo layout, and optionally truncates at 600 seconds. | `AudioSignal` `(2, n)` samples. | `analysis/decode.py`; gives every later measurement one consistent input. |
| 9. Extract track measurements | `AudioSignal` | Trims near-silent edges; rejects <20 s or near-silent audio; computes loudness, spectrum, stereo, rhythm, texture, MFCC statistics, and codec coverage. | `TrackFeatures`. | `analysis/features.py`; raw measured signal representation. |
| 10. Store analysis | `TrackFeatures` plus timing/source info | Stores JSON features under `analyzer/1`, denormalised brightness/energy, and status/error. Temporary directory exits and deletes audio. | shared `TrackAnalysis`. | `music/pipeline.py`, `music/models.py`; supports caching and auditability. |
| 11. Finalize submission | Track statuses | When no selected track remains queued/analyzing, enqueue `music.build_profile`. | `aggregating` job. | `maybe_finalize()`; ensures aggregation sees completed/failed decisions. |
| 12. Curate library | All successful stored analyses for user | `curate()` finds duplicates, down-weights outliers, optionally clusters sonic modes with PCA/KMeans/silhouette. | weights, cluster labels, duplicate/outlier metadata. | `analysis/curation.py`; prevents one duplicate or atypical upload from dominating. |
| 13. Aggregate library | Curated track features | Computes weighted medians, bootstrap uncertainty, dB deviations from calibration corpus, descriptors, spectrum, clusters, map, and notes. | `MusicProfileData`, stored as `music-profile/2`. | `analysis/aggregate.py`; converts track rows into library-level evidence. |
| 14. Build music-only sound profile | Latest `MusicProfileData` | `rebuild_sound_profile()` calls `fuse(music=..., answers=latest answers)`. With no answers, the prior plus music are used. | `sound_profiles` row with music layer. | `sound_profile/service.py`; creates a target in the same dB vocabulary as IEM curves. |
| 15. Collect questionnaire | Versioned questions | Frontend gets `/api/questionnaire`; draft previews call `/api/sound-profile/preview`; final submit validates version and allowed values. | `QuestionnaireResponse`, then new sound profile. | `questionnaire/definition.py`, `router.py`; adds evidence that music cannot reveal. |
| 16. Fuse evidence | Music profile, answers, assumptions | Closed-form Gaussian update per dimension; music is a conditional prior, answers are noisy observations, posterior becomes dB offsets and percentile values. | `preference_curve` over nine bands plus dimensions/layers/basis. | `sound_profile/fusion.py`; produces an explicit personal target with uncertainty. |
| 17. Load IEM target/candidates | Profile target name and database | Loads Harman IE 2019 raw target, normalises/grid-interpolates it, loads one stock measurement per IEM on `iec60318-4`, latest price if present. | `Target`, `Candidate[]`. | `recommend/service.py`; ensures comparable measurement basis. |
| 18. Filter and score | Profile, candidate curves, constraints | Same rig family, applicable known-currency budget, and sufficient coverage are required. For each candidate, 256 deterministic posterior target draws are scored with Olive terms. | expected score, 10th/90th percentile, population score. | `recommend/harman.py`; ranks against the user's target, not only the average target. |
| 19. Explain and return | Scored candidates | Computes bass/lower-mids/vocals/treble/air region errors, tolerance, fit word, provenance, and reasons. | `RecommendationsOut` at `/api/recommendations`. | `recommend/base.py`, `harman.py`; makes every recommendation inspectable. |

## State transitions

Submission states are `queued → resolving → analyzing → aggregating → completed` or `failed`. Track states are `queued`, `analyzing`, `done`, `failed`, or `skipped`. Job states and heartbeats are independent queue records so the worker can recover stale work.

# 5. Music and audio pipeline

## Audio acquisition

Only YouTube URLs are accepted. `parse_youtube_url()` accepts normal YouTube video/playlist forms, short links, Shorts, embed/live paths, and rejects unsupported hosts, credentials, non-http schemes, private lists, auto-generated mixes, malformed IDs, and overly long input. Downstream code receives a `YouTubeRef`, and `canonical_url` is reconstructed by the application.

`yt-dlp` is configured with:

- `allowed_extractors` restricted to YouTube extractors;
- metadata-only resolution before selection;
- maximum playlist entries of 500;
- best audio-only download;
- 60 MB download limit from settings;
- maximum track duration of 20 minutes;
- retry/classification for transient network, rate-limit, and bot-check errors.

The download is inside `TemporaryDirectory(prefix="track-")`. `fetch_and_extract()` returns measurements, not the file. When the context exits, the temporary audio is removed. A local yt-dlp metadata cache may remain under the configured work directory; audio retention beyond the temporary directory is **Not verified from codebase**.

## Decode and preprocessing

- Decoder: PyAV, using its bundled FFmpeg bindings.
- Analysis sample rate: **44,100 Hz** (`ANALYSIS_SAMPLE_RATE`).
- Format: planar float32 (`fltp`) and stereo layout.
- Mono input: resampler requests stereo, so a mono source is represented as two channels with the same signal.
- Long tracks: only the first **600 seconds** are decoded/analyzed by `music/acquire.py`.
- Leading/trailing silence: `_trim_silence()` removes blocks quieter than 50 dB below the track peak.
- Minimum analysable content: **20 seconds** after silence trimming.
- Silence rejection: integrated loudness below **−60 LUFS** or non-finite loudness is rejected.
- No global peak normalization is applied to the audio before measurement. Spectral balance is level-invariant because it is computed relative to a reference range; loudness is measured separately.
- Rhythm/timbre path: mono is resampled with soxr to **22,050 Hz**.
- Rhythm/timbre excerpt: the whole signal if short, otherwise three 30-second excerpts near 20%, 50%, and 80% of the analysed signal.

## Raw audio → low-level features → representation → profile

```text
RAW AUDIO
  waveform samples, source codec/rate/channels
       ↓ deterministic DSP
LOW-LEVEL MEASUREMENTS
  loudness, spectrum, bands, stereo, rhythm, texture, MFCC statistics
       ↓ calibration, curation, weighted statistics
MUSIC REPRESENTATION
  per-band dB balance vs 30-track corpus, bootstrap SE/interval,
  descriptors, spectrum, clusters, representative tracks
       ↓ Bayesian fusion with answers
PERSONAL SOUND PROFILE
  latent preference dimensions, dB offsets vs Harman IE 2019,
  posterior uncertainty, evidence provenance
       ↓ FR matching
IEM RECOMMENDATIONS
```

## Features actually implemented

| Feature | What it measures | Useful for | What it does not mean | Current use |
|---|---|---|---|---|
| Integrated LUFS | K-weighted gated average loudness, BS.1770-style | Overall level and energy/dynamics descriptor. | It is not perceived quality, genre, or listener preference. | Stored; contributes to `energy` and dynamics-related descriptors. |
| Loudness range (LU) | Spread of gated 3-second short-term loudness values, 0.5 s hop | How much loudness changes over time. | It is not the same as compression ratio or musical excitement. | Stored; contributes to `dynamics`. |
| Sample peak dBFS | Largest sample magnitude relative to digital full scale | Peak/headroom indicator. | It is not true peak and does not prove clipping absence. | Stored; used in peak-to-loudness. |
| Peak-to-loudness | Peak dBFS minus integrated LUFS | Approximate headroom/crest characteristic. | It is not a standard dynamic-range certification. | Stored; contributes to `dynamics`. |
| Nine band levels | Power per octave relative to 500 Hz–2 kHz: sub-bass, mid-bass, lower mids, mids, upper mids, presence, lower treble, upper treble, air | Interpretable tonal balance, level-invariant across mastering loudness. | A band level is not a direct perceptual label or preference measurement. | Primary music representation and sound-profile music input. |
| Long-term spectrum | 1/6-octave-like log-grid spectrum relative to the same reference range | Shows individual song/library spectral shape. | It is not an embedding or semantic understanding. | Stored/displayed; used for visualisation and corpus deviation. |
| Effective bandwidth | Highest frequency with meaningful summed content within 70 dB of spectral peak | Detects lossy low-pass/codec limitations. | It is not evidence that the listener dislikes or likes air. | Controls codec coverage and prevents reading missing treble as taste. |
| Spectral centroid | Magnitude-weighted centre of spectral energy, reported p10/median/p90 over active frames | A compact brightness-related signal statistic. | It is not brightness in all musical contexts. | Stored; calibrated heuristic `brightness`. |
| Spectral rolloff | Frequency below which 85% of in-range magnitude lies | Spectral distribution summary. | It is not a hard cutoff or perceived treble. | Stored as a measurement. |
| Spectral flatness | Geometric mean / arithmetic mean of spectral power | Noise-like versus tonal/peaked texture. | It is not “quality” or noisiness alone. | Stored; contributes to density heuristic. |
| Side-to-mid energy | Stereo side energy relative to mid energy in dB | Stereo width statistic. | It is not a psychoacoustic soundstage measurement. | Stored; contributes to `width`. |
| Tempo | Beat-tracking estimate from onset envelope | Rhythm summary. | It can be wrong for non-percussive or ambiguous music. | Stored as optional BPM. |
| Onset rate | Detected onsets per second | Transient activity. | It is not tempo and does not identify genre. | Stored; contributes to `energy` and `density`. |
| Percussive ratio | HPSS percussive energy / total excerpt energy | Texture/transient share. | It is not the percentage of instruments that are drums. | Stored; contributes to `energy`. |
| MFCC mean/std | Statistics of 20 mel-frequency cepstral coefficients over excerpts | Timbre similarity, duplicate/outlier detection, clustering. | It is not an interpretable sound preference axis. | Used only in curation/similarity; not direct matching. |

### Features not implemented

Spectral contrast, chroma, key, beat-synchronous harmonic features, semantic genre classifiers, neural embeddings, and source separation are not present in `TrackFeatures`. They must not be claimed in a viva as current Auralis features.

## Spectral computation details

`analysis/spectral.py` uses an 8,192-point FFT and a hop of 4,096 samples at 44.1 kHz. It processes frames in chunks of 256, gates activity to frames within 35 dB of the 90th-percentile frame energy, computes band power, the long-term spectrum, centroid, 85% rolloff, flatness, and effective bandwidth. Band levels are power per octave relative to the 500 Hz–2 kHz reference range, so pink noise reads approximately 0 dB across bands.

## Per-track descriptors

`analysis/descriptors.py` is explicitly the heuristic layer. It loads `calibration.json`, converts robust corpus z-scores through a logistic function, and produces 0–1 values for:

- brightness;
- warmth;
- energy;
- dynamics;
- density;
- stereo width;
- band emphasis.

A value around 0.5 means typical for the calibration corpus, not a validated perceptual score. Raw measurements remain stored next to these descriptors.

## Library curation and aggregation

`analysis/curation.py` applies:

- duplicate detection using calibrated metrics plus MFCC statistics;
- duplicate weight 0 so the canonical recording counts once;
- robust-z outlier detection after at least 8 unique tracks, with outliers down-weighted to `0.25`, not deleted;
- optional clustering after at least 10 unique tracks, using calibrated features, robust MFCC contribution, PCA, KMeans from 2 to 5 clusters, and a silhouette threshold of `0.12`.

`analysis/aggregate.py` then uses weighted medians and weighted quantiles. It draws 400 seeded bootstrap resamples where enough positive-weight tracks exist. It stores counts, band levels, dB deviations from the calibration corpus, balance z-scores, standard errors, 90% intervals, descriptor summaries, spectrum percentiles, clusters, map points, representative tracks, and notes about low sample count, codec coverage, duplicates, outliers, truncation, and multiple listening modes.

# 6. AI and machine learning

## Classification of actual components

| Component | Category | Current role |
|---|---|---|
| FFT, filters, STFT, loudness, HPSS, MFCC, onset/beat algorithms | Deterministic signal processing / MIR algorithms | Convert audio into measurements. |
| Robust z-scores, weighted medians, bootstrap, quantiles | Statistical methods | Summarise a library and estimate uncertainty. |
| PCA + KMeans + silhouette score | Classical unsupervised ML | Inspect/cluster sonic modes and analyse IEM tuning structure. |
| Gaussian posterior fusion | Statistical model / Bayesian inference | Combine music evidence, questionnaire evidence, and priors. |
| Olive et al. formula | Published linear statistical preference model | Predict IEM preference from FR error terms. |
| MERT, CLAP, neural embedding models | Not used | Discussed in research documents but deliberately not adopted for matching. |
| Generative AI | Not used | No text/image/audio generation model is called by the app. |

## Why Auralis does not train a supervised recommender

The database has users, profiles, questionnaire responses, measurements, and recommendations, but it does not have a table of observed outcomes such as “user X tried IEM Y and liked/disliked it.” Without labelled user–IEM outcomes, fitting a supervised personalized recommender would create a model that cannot be validated against the target behavior.

## Classical ML details

PCA and KMeans are used in `analysis/curation.py` for sonic clusters. PCA is also used by the evaluation suite to examine IEM response-curve structure. The checked-in evaluation reports that for 203 measured curves, the first component resembles a bass shelf and explains 54.5% of variance, the second resembles broad tilt and explains 16.1%, and five components explain about 90.4%. This supports a low-dimensional regional target representation, but it is an analysis result, not a deployed deep model.

## Bayesian model details

For each dimension, the model starts with a Gaussian prior `θ ~ N(0, σ²)`. Music shifts the prior through one explicit correlation `ρ`; questionnaire answers become observations with noise based on assumed reliability `r`; the posterior combines precisions in closed form. The implementation is deterministic apart from seeded posterior draws in recommendation.

The Bayesian model is “AI” only in the broad applied-statistics sense. It is not a trained neural network and it does not learn weights from Auralis user data.

## Computational requirements and limitations

- The analysis path is CPU-oriented NumPy/SciPy/librosa code; no GPU is required by current dependencies.
- Audio analysis requires memory proportional to the bounded decoded signal and intermediate arrays; the ten-minute cap limits worst-case input.
- Recommendation uses 256 seeded posterior draws per candidate and vectorised NumPy formulae; it does not require a model server.
- PCA/KMeans require all selected track/curve features in memory for the current operation.
- No production GPU, model-serving infrastructure, embedding model, or distributed feature store is present.

# 7. Personal sound profile

## Profile dimensions

The current `sound-profile/3` defines eleven dimensions:

| Group | Dimensions | Unit | Music speaks? |
|---|---|---|---|
| Tonal | sub-bass, mid-bass, warmth, vocal presence, treble, air | dB relative to Harman IE target | Yes, if codec coverage is adequate. |
| Character | energy | standard-deviation units | Yes. |
| Tolerance | treble tolerance | standard-deviation units | No; the library cannot reveal tolerance reliably. |
| Priority | detail, soundstage, naturalness | standard-deviation units | No; answers only. |

The UI-facing `value` is a 0–1 estimated population percentile `Φ(μ/σ)`. It is not a probability that a label is true and should not be described as a confidence percentage. The model also stores posterior `mean`, `sd`, evidence, basis, music-only value, answer-only value, and confidence as “share of population variance resolved.”

## Questionnaire mappings

The nine questions are defined in `questionnaire/definition.py`: bass amount, bass character, vocal position, treble feel, tonal lean, energy, detail, soundstage, and naturalness.

Actual mapping examples:

- bass amount maps to `(-3, -2, 0, +2.5, +5)` dB, based on Harman listener classes;
- “rumble” versus “punch” tilts sub-bass and mid-bass by a hand-coded ±1 dB heuristic;
- vocal, energy, and some other five-point scales map to equal-probability population quantiles;
- treble feel maps to treble, treble tolerance, and indirectly air;
- tone maps directly to warmth and indirectly to treble;
- detail, soundstage, and naturalness map to priority dimensions.

These are explicit heuristics and literature-informed mappings, not learned from Auralis user responses.

## Fusion behavior

The default assumptions in `sound_profile/assumptions.py` are:

| Parameter | Default | Status |
|---|---:|---|
| Bass prior SD | 3.0 dB | Literature-informed. |
| Treble prior SD | 2.5 dB | Literature-informed. |
| Mids prior SD | 1.5 dB | Assumption. |
| Air prior SD | 2.5 dB | Assumption. |
| Answer reliability | 0.70 | Literature-informed from single-item research in another field. |
| Indirect-answer factor | 0.50 | Assumption. |
| Music–preference correlation `ρ` | `sqrt(0.70) ≈ 0.837` | Hypothesis; not measured. |

There is no fixed “music 70%, questionnaire 30%” split. The relative influence follows from posterior precision, `ρ`, the bootstrap SE of the library, and answer reliability. With missing or weak evidence, the prior remains visible.

## Resulting curve and visualization

The personal target is represented by nine band offsets. The mids band is the fixed reference; sub-bass and mid-bass come from bass dimensions; lower mids from warmth; upper mids from vocal presence; presence from vocal presence and treble; lower/upper treble from treble; air from air. Offsets are shown with an 80% central credible range.

The frontend lets the user switch among music-only, answers-only, and combined curves. It visually distinguishes music evidence, answers, posterior range, and the neutral/reference line. The API also stores the basis words “strong”, “moderate”, “limited”, “none”, and whether answers agree, refine, or differ from music.

# 8. IEM and headphone data

## Data source and provenance

`iem/datasets.py` imports:

- Harman in-ear 2019 target;
- Harman in-ear 2019 without bass shelf target;
- oratory1990 in-ear measurements distributed through AutoEq at pinned commit `7ae0f56d53074872b028649617a22bbb4232feb7`.

The importer keeps raw points, checksum, source URL, source reference, rig, rig family, variant, retrieval time, licence, and notes. It limits imported IEMs to recognized GRAS rigs mapped to `iec60318-4`; measurements from other rig families are not silently mixed with the Harman in-ear target.

The actual imported rows are not bundled in this repository. The dated audit artifact reports 211 measurements, 203 earphones, two targets, and zero stored prices at the time of that audit. Those counts are snapshot evidence, not a fresh query here.

## FR processing

`acoustics/fr.py` implements `fr/2`:

1. Require at least 20 finite `(frequency_hz, dB)` points.
2. Require positive, strictly increasing frequencies.
3. Require coverage from at least 100 Hz to 10 kHz.
4. Reject implausible curves with a range above 80 dB.
5. Interpolate linearly in log-frequency onto a 1/48-octave grid.
6. Preserve unknown regions as NaN/null rather than inventing extrapolated values.
7. Normalise at 500 Hz using the mean in a one-third-octave window.
8. If a target is available, compute `measurement − target` on the common grid.
9. Smooth band features by 1/6 octave.
10. Compute rig validity weights: sub-bass 0.7, mid-bass 0.9, most mid bands 1.0, upper treble 0.5, air 0.2.
11. Compute Olive terms on the ISO R40 grid for 20 Hz–10 kHz.

## Olive terms and predicted preference

For the error curve, Auralis computes:

- standard deviation `SD` over 20 Hz–10 kHz;
- slope against `ln(frequency)` over the same range;
- aligned mean absolute error `AAE` over 40 Hz–10 kHz, aligned at 500 Hz;
- score:

```text
100.0795 − 8.5·SD − 6.796·|slope| − 3.475·AAE
```

This is **model-inferred**, not a direct measurement of a listener. The score is the published average-listener model when evaluated against the Harman reference target. Applying the same model to a personal target is an Auralis-labelled extension/heuristic.

## Database representation

- `iems`: identity and catalogue metadata;
- `fr_measurements`: raw points and provenance;
- `fr_targets`: raw target curves and provenance;
- `iem_acoustic_profiles`: processed grid and feature JSON keyed by measurement, processor version, and target;
- `iem_price_observations`: dated/source prices, not a single permanent product property.

Unknown price, driver configuration, release year, availability, or measurement regions remain unknown. `iem/catalog.py` refuses prices without currency, source, and observation date; it refuses specs without source URL and retrieval date.

# 9. Recommendation engine

## Inputs

The default `HarmanPersonalRecommender` receives:

- the latest `SoundProfileData`;
- eligible `Candidate` objects containing one selected FR measurement per IEM;
- the rig-matched Harman target;
- constraints derived from the user profile: budget min/max, currency, and rig family.

## Eligibility filters

An IEM is eligible only if:

1. its measurement rig family equals the target rig family and the requested constraint rig family;
2. its known price is inside the budget when both price and user currency are comparable;
3. its FR coverage is sufficient for `fr.olive_inear()`.

Unknown or incomparable prices are not silently removed. They remain eligible but receive a reason saying the budget was not checked. In the audited snapshot, no prices were stored, so budget filtering was effectively inert.

## Ranking algorithm

For every eligible candidate:

1. Interpolate its response and the target on the ISO R40 frequency grid.
2. Compute the candidate error against the population reference for `population_preference`.
3. Draw 256 posterior target-offset samples. Samples are made per dimension so bands sharing a dimension move together.
4. Interpolate each sampled nine-band personal offset curve in log-frequency.
5. Subtract each personal target from the candidate's response.
6. Compute the Olive SD, slope, and AAE formula for every draw.
7. Set `predicted_preference.mean` to the mean score and `low/high` to the 10th/90th percentiles.
8. Sort descending by expected personal score.

The draws are deterministic because the random generator seed is derived from the profile curve.

## Explanation generation

The engine calculates five regions: bass, lower mids, vocals/presence, treble, and air. It reports:

- mean candidate error from the personal target;
- target offset from the population reference;
- tolerance from the target's posterior SD, with a minimum 1 dB floor;
- fit: within, above, below, or unreliable;
- measurement and target basis words;
- reasons for the strongest matches and mismatches;
- a note when air is above 10 kHz and therefore unreliable;
- an expected-rating note with the 80% score range;
- price/variant notes when relevant.

The `Reason` object carries the same `error_db` and `tolerance_db` numbers used by `RegionFit`. The evaluation audit reports 170 quantitative reasons re-derived from raw curves with 170 consistent.

## Worked conceptual example

Suppose two candidates are measured on the same accepted rig:

- Candidate A has a response close to the listener's posterior personal target across bass, vocals, and treble.
- Candidate B is closer to the population Harman curve but has a +6 dB bass error relative to a listener whose posterior target is bass-light.

Candidate A can rank above Candidate B even if B has a higher population score, because A's expected score over the listener's personal target draws is higher. The report returned for B would identify the bass region as above the personal target and include the computed error/tolerance. No brand reputation or text review is used in this rank.

# 10. Why the technologies were chosen

| Viva question | Engineering answer grounded in this repository |
|---|---|
| Why Next.js? | The team needed a route-based React application, a clean App Router structure, and a same-origin rewrite for `/api/*`. The frontend already uses client-side TanStack Query and interactive visualisations, so Next.js provides the application shell without adding a separate frontend server. |
| Why FastAPI? | It gives typed request validation, automatic OpenAPI, simple dependency injection for sessions/auth, and a natural fit for a Python numerical backend. |
| Why PostgreSQL? | The project needs relational ownership/foreign keys and transactions, but also wants flexible JSONB for large versioned feature/profile documents. PostgreSQL also supports `FOR UPDATE SKIP LOCKED` and partial unique indexes needed by the database-backed queue. |
| Why Python? | NumPy, SciPy, librosa, PyAV, scikit-learn, and the research code all live comfortably in Python. The analysis layer can be tested as pure functions. |
| Why librosa? | It provides maintained MIR primitives used here for onset strength, beat tracking, HPSS, mel spectrograms, and MFCCs. The project uses it for measurements, not as a black-box preference model. |
| Why PyAV instead of shelling out to FFmpeg? | PyAV exposes FFmpeg decoding through Python and the project states that no system FFmpeg installation is required. It also lets the code bound output duration during decoding. |
| Why a PostgreSQL queue instead of Celery/Redis? | The current scope needs a small number of job types and already has PostgreSQL. A table with row locking, dedupe keys, retries, and heartbeats keeps infrastructure small and makes job state transactionally close to domain state. |
| Why asynchronous processing? | YouTube metadata/network work and CPU audio analysis take too long for a normal API request. The API returns an accepted submission; workers update progress while the UI polls. |
| Why nine frequency bands? | The bands form a shared, human-readable vocabulary between music measurements, personal targets, visualisation, and IEM explanations. The edges are a project convention, explicitly versioned as `bands/1`, not claimed as a universal standard. |
| Why 44.1 kHz? | It is a common music sample rate and supports the project’s 20 Hz–20 kHz range for typical sources. Rhythm/timbre work is separately downsampled to 22.05 kHz. |
| Why 8,192-point FFT? | The code comment says it provides about 5.4 Hz resolution at 44.1 kHz, enough to resolve the sub-bass band while remaining practical. |
| Why normalise spectra against 500 Hz–2 kHz? | It makes tonal balance less dependent on mastering loudness and gives a stable reference range. The same code defines pink noise as approximately 0 dB per octave. |
| Why weighted medians? | A median is more resistant than a mean to one extreme track. Weights preserve the library while preventing duplicates and atypical outliers from dominating. |
| Why bootstrap? | A small library should produce a wider uncertainty interval than a large consistent library. The seeded 400-song-resample bootstrap makes that uncertainty visible and reproducible. |
| Why PCA/KMeans? | They answer a concrete curation question: does the library contain distinct sonic modes, and what broad dimensions describe them? They are not used as a hidden recommender. |
| Why no MERT? | MERT is a strong music-understanding representation, but the repository has no validated mapping from a MERT embedding to preferred IEM frequency response. Using it for matching would be opaque and unsupported by outcome data. |
| Why a Bayesian model? | It lets the system combine weak music evidence and noisy questionnaire evidence without pretending they have fixed weights. It also returns posterior uncertainty and records assumptions. |
| Why the Olive formula? | It is a published in-ear model based on measured deviation from the Harman target and has an implementation check against AutoEq in the project evaluation. |
| Why same-rig filtering? | A target curve and measured response are only comparable on a compatible fixture family. The code refuses cross-rig comparisons instead of silently translating them. |
| Why store raw points and derived profiles separately? | Algorithms and calibration can change. Keeping immutable raw measurements, processor versions, checksums, and derived rows allows rebuilding while preserving provenance. |
| Why one candidate per IEM? | The loader prefers the stock configuration and uses a variant only if no stock measurement exists, preventing products with many measured variants from receiving an unfair search advantage. |
| Why no exchange-rate conversion? | The frontend/backend keep budgets in the user's currency. Converting would require a time-dependent external source and could create false precision; the current code does not do it. |

# 11. Research foundation

The repository's own research documents support some components and explicitly identify the central gap. The five papers requested for viva preparation are treated as follows. The first paper was not cited in the repository; its identity was verified externally as the 2018 Fricke et al. paper below. External paper links are included for reference, while claims about implementation come from the codebase.

## 11.1 Fricke et al. (2018)

**Paper identified:** Fricke et al., *Computer ratings of music features mirror human ratings and show an individual music preference structure*, Journal of Research in Personality 75 (2018), 94–102.

**Contribution:** computer-extracted music features showed good agreement with human ratings and reproduced a three-component music-preference structure in a large online sample. The work supports the general idea that audio features can be used to describe individually selected music at scale.

**Auralis adopts:** the principle that user-selected music can be measured rather than treated as an unstructured playlist.

**Auralis adapts:** Auralis does not reproduce the ESSENTIA/MUSIC/AVD model. It uses its own long-term spectral bands, loudness, rhythm, timbre statistics, and a disclosed 30-track calibration corpus.

**What it does not prove:** it does not establish that a user's music balance predicts the IEM tuning they will prefer.

## 11.2 MERT (2024)

**Paper:** Li et al., *MERT: Acoustic Music Understanding Model with Large-Scale Self-supervised Training*, ICLR 2024.

**Contribution:** a large self-supervised music representation model using acoustic and musical teacher signals and evaluated across music-understanding tasks.

**Auralis adopts:** the research lesson that learned music representations can be powerful for music understanding.

**Auralis does not adopt:** MERT inference, fine-tuning, or embeddings are not in the dependencies or source. The methodology explicitly rejects embedding-based matching for now because no labelled link to IEM preference exists.

**Viva position:** MERT is relevant context and future research, not a current Auralis model.

## 11.3 Olive, Welti & Khonsaripour (2017), Part 1

**Paper:** *A Statistical Model that Predicts Listeners’ Preference Ratings of In-Ear Headphones: Part 1—Listening Test Results and Acoustic Measurements*.

**Contribution:** controlled tests with 71 listeners and 30 in-ear models found that the Harman in-ear target was preferred on average and that deviation from the target related to preference.

**Auralis adopts:** the Harman in-ear reference target, same-rig principle, 500 Hz normalisation convention, and the premise that measured FR deviation can be meaningful for preference modeling.

**Auralis adapts:** individual preference is represented as regional target offsets and uncertainty instead of assuming every listener has exactly the population target.

## 11.4 Olive, Welti & Khonsaripour (2017), Part 2

**Paper:** *A Statistical Model that Predicts Listeners’ Preference Ratings of In-Ear Headphones: Part 2—Development and Validation of the Model*.

**Contribution:** a linear model predicts in-ear preference from error-curve size/statistics, with reported correlation `r = 0.91`.

**Auralis adopts:** the terms and coefficients implemented in `acoustics/fr.py`: SD, slope, AAE, and the 0–100 predicted-preference formula. The evaluation compares Auralis results against AutoEq’s published values.

**Auralis adapts:** it evaluates the same model against a posterior personal target. That is an extension, not what the original population model directly validated.

## 11.5 Olive, Welti & Khonsaripour (2019)

**Paper:** *Segmentation of Listeners Based on Their Preferred Headphone Sound Quality Profiles*.

**Contribution:** re-analysis of controlled headphone preference data using clustering to investigate listener segments and demographic/acoustic factors associated with preference differences.

**Auralis adopts:** the idea that listeners vary and that a single target is not a complete personalization model.

**Auralis adapts:** the code represents variation with named priors and regional offsets rather than deploying the paper's listener clusters as a classifier. Bass/treble spread values are literature-informed, while mids/air and the music correlation remain assumptions/hypotheses.

## Research gap

Existing research supports individual components: computer-extracted music features can describe music preference, and headphone/IEM frequency-response measurements can predict average preference. It does **not** establish the direct bridge from a person's actual music listening to that person's preferred IEM tuning.

That bridge is Auralis's central hypothesis. The implementation exposes it as `music_correlation`, evaluates sensitivity across negative, zero, and positive values, and states that a listening study or real IEM feedback is required to estimate it. The papers do not prove that Auralis works.

# 12. Scientific limitations

| Limitation | Why it exists | Improvement |
|---|---|---|
| No labelled user–IEM preference outcomes | Current database stores candidates and recommendations, not trials/ratings. | Run a controlled listening study and collect real IEM feedback. |
| Music-to-preference correlation is unvalidated | No cited study links a listener's library balance to preferred IEM balance. | Estimate `ρ` from a study; compare content-matching and compensation hypotheses. |
| Answer reliability is borrowed from another field | `r=0.70` is based on single-item self-report literature outside audio. | Test–retest reliability and multi-item audio questionnaires. |
| Small hand-picked reference corpus | `calibration/corpus-2026-09.tsv` is a disclosed 30-track corpus. | Increase diversity by era, mastering, genre, language, and production style. |
| YouTube source variability | Upload codec, mastering, edits, and availability may not represent the original release. | Use licensed high-quality sources, fingerprints, multiple-source reconciliation, and source quality indicators. |
| No play counts or listening duration | Links reveal selected tracks, not how often a user listens. | Integrate consented listening history or allow explicit weights. |
| Track features are not direct perceptual labels | Centroid, LUFS, MFCC, etc. are signal statistics. | Validate descriptors against listener ratings; retain raw measurements. |
| Descriptors are heuristic | Logistic z-score mappings and labels such as warmth/brightness are not validated perceptual models. | Fit or validate perceptual models with human ratings. |
| Questionnaire mappings are hand-designed | Answer bins and bass rumble/punch tilt are explicit design choices. | Learn mappings from enough responses/outcomes, while keeping them inspectable. |
| Frequency-response measurements vary by rig, seal, and configuration | Even within a rig family, fit and eartips affect response. | Increase same-rig measurements, preserve variant metadata, model measurement uncertainty. |
| Above-10-kHz uncertainty | IEC 60318-4 validity and the preference model are limited near/above 10 kHz. | Use an appropriate high-frequency fixture/target or leave air unscored. |
| One primary measurer/dataset | Current importer focuses on oratory1990 through AutoEq. | Add independently sourced same-family measurements and measure inter-source agreement. |
| Personal-target use of Olive model is an extension | Original model is an average-listener/reference-target model. | Validate predictions against personal listening tests. |
| Budget data may be empty or stale | Catalog importer is present, but the audit snapshot had zero prices. | Add dated sourced prices and show missing-price status clearly. |
| Recommendation evaluation is indirect | Current evaluation tests correctness, stability, sensitivity, and explanations, not whether people like the result. | Prospective user study with held-out preference outcomes. |
| Dataset counts are not repository-contained | External DB/cache is not committed. | Ship reproducible dataset manifests/checksums or a safe demo fixture. |

# 13. Security and privacy

## Protections present in code

- **Anonymous-first sessions:** users need only a display name; email/password authentication is not implemented.
- **Token handling:** `secrets.token_urlsafe(32)` creates a random bearer token; only SHA-256 hash is stored in `sessions`.
- **Cookie flags:** HttpOnly, SameSite=Lax, Secure in production, path `/`, and a 90-day TTL.
- **CSRF:** state-changing `/api/*` requests require `x-auralis-client: web`; the frontend adds it through an `openapi-fetch` middleware.
- **Authorization:** current-user dependencies scope queries to the session user; deletion cascades personal rows.
- **URL validation:** only YouTube hosts, http(s), standard ports, and strict ID formats are allowed; arbitrary user URLs are not forwarded to yt-dlp.
- **Extractor restriction:** yt-dlp is configured for YouTube extractors only.
- **Input limits:** max 20 submitted URLs, max 120 tracks per submission, max 2 active submissions, max 60 MB download, max 20-minute track, 500 playlist entries.
- **Validation:** Pydantic forbids extra request fields in important bodies, checks budget order/ranges, question version and allowed answer values, and validates FR data.
- **Temporary audio:** downloaded audio is stored inside a per-track temporary directory and removed after extraction.
- **Security headers:** Next config adds `nosniff`, `DENY` framing, strict referrer policy, and a restrictive permissions policy; powered-by header is disabled.
- **Deletion:** `DELETE /api/me` removes the user and owned data using foreign-key cascades; shared public-track analyses remain.

## Risks or gaps visible in code/docs

- No general request rate limiter is implemented. The active-submission cap is an abuse/resource guard, not a full rate limiter.
- No Content-Security-Policy is configured.
- No structured logging or error-tracking service is configured.
- Database encryption at rest, backups, network TLS, and deployment firewall policy are **Not verified from codebase**.
- Anonymous session tokens are bearer credentials; account recovery is not implemented.
- YouTube and AutoEq network calls depend on external availability and terms/licensing.
- The in-memory preview cache is process-local and has no distributed eviction/coordination.

# 14. Performance and scalability

## Current computationally expensive operations

1. YouTube metadata resolution and audio downloads are network-bound.
2. PyAV decoding and 10-minute audio arrays are CPU/memory-bound.
3. FFT/STFT, loudness filters, librosa onset/beat/HPSS/MFCC are CPU-bound.
4. Library curation may run PCA, KMeans, and silhouette scoring.
5. Recommendation scans all eligible IEMs and computes 256 posterior draws per candidate.

The current worker defaults to concurrency 3. Source metadata resolution uses a separate thread pool of 6. The database engine uses pool size 10 with max overflow 10.

## Dated audit snapshot

`docs/audit-report.md` reports, for the running system audited 2026-09-28:

- median analysis per song 7.1 s, p90 10.0 s, plus median download 4.2 s;
- a 113-song playlist in roughly 7 minutes with three workers;
- recommendations for 203 earphones in 456–540 ms, with candidate loading around 164 ms;
- evaluation suite around 3 minutes;
- 382 tracks, 288 successful analyses, 8 music profiles, 20 sound-profile versions, 31 anonymous accounts, 203 earphones, 211 measurements, 422 processed representations, 2 targets, and 0 prices.

These are dated operational observations from the checked-in audit, not a guarantee for a clean installation.

## What happens at different user counts

| Load | Current likely behavior | Bottleneck / honest assessment |
|---|---|---|
| 10 users | A small worker pool can process jobs; track analyses are shared by exact source ID and analyzer version. | YouTube network and CPU analysis dominate. This is the scale the current architecture is most plausibly suited to. |
| 100 users | Queue rows and PostgreSQL locking can coordinate work, but three workers serialize much of the CPU/download workload. Shared tracks help only when users submit the same source IDs. | Need capacity tests, more workers/process isolation, database indexes/monitoring, and YouTube rate-limit handling. |
| 10,000 users | The current single database + small worker pool is not demonstrated to scale. API reads may be possible, but ingestion, downloads, JSONB growth, database connection usage, and external YouTube limits become material. | Horizontal workers, rate limiting, object storage, queue separation, caching, job observability, and data-retention policy would be required. These are future design ideas, not current functionality. |

# 15. Live demonstration script

## Pre-demo checklist

1. Start PostgreSQL, apply Alembic migrations, start FastAPI, start one or more workers, and start Next.js.
2. Confirm `GET /api/health` returns `{"status":"ok"}`.
3. Confirm the IEM target and at least a small measured candidate fixture are imported. The repository does not bundle those data files, so this must be checked on the demo machine.
4. Use stable public/unlisted YouTube links and keep a backup submission ready.
5. Do not claim budget filtering is active unless sourced price rows exist.

## Screen-by-screen script

### Screen 1: landing page `/`

**Show:** the Auralis landing page and the spectral field/band explorer.  
**Say:** “Auralis starts with the music a listener already chooses. The visual language shows frequency from low bass to air, but this landing animation is illustrative; actual values are calculated later by the backend.”  
**Underneath:** React/Motion/canvas components render the product story; this screen does not call the audio analyser.

### Screen 2: start `/start`

**Show:** enter a display name.  
**Say:** “The project is anonymous-first. A display name creates a local account; there is no email or password step.”  
**Underneath:** `POST /api/session` creates `users`, `profiles`, and a hashed-token `sessions` row; an HttpOnly cookie signs the browser in.

### Screen 3: add music `/music`

**Show:** paste one video and/or one playlist; show link previews and the selected “song/whole playlist” choice.  
**Say:** “The application accepts YouTube links but reduces them to validated IDs before fetching. It rejects unsupported hosts, private lists, mixes, malformed IDs, and dangerous URL forms.”  
**Underneath:** frontend parsing calls `/api/music/link-preview`; submission calls `POST /api/music/submissions`; the backend stores canonical source IDs and enqueues ingestion.

### Screen 4: live analysis `/analysis/{id}`

**Show:** resolving/analyzing progress, accepted/skipped/failed tracks, spectra, and the forming signature.  
**Say:** “The browser is not doing the heavy audio analysis. A PostgreSQL-backed worker resolves metadata, selects representative tracks, downloads each uncached audio file temporarily, decodes it, computes measurements, stores the JSON features, and deletes the file.”  
**Underneath:** jobs run `music.ingest`, `music.analyze_track`, and `music.build_profile`; TanStack Query polls the submission.

### Screen 5: explain one track

**Show:** if the UI exposes a track or spectrum hover, show one spectrum and one band.  
**Say:** “The measured layer is separate from interpretation. The spectrum and loudness are signal measurements. Labels such as warmth or brightness are later heuristic summaries.”  
**Underneath:** `TrackFeatures` includes nine band levels, spectrum, loudness, centroid, rolloff, flatness, stereo, rhythm, percussive ratio, and MFCC statistics.

### Screen 6: questionnaire `/tune`

**Show:** answer bass, vocals, treble, tone, energy, detail, stage, and naturalness questions. Move one answer and show the curve preview.  
**Say:** “The questions are intentionally in listener language. The preview is not stored; the API fuses the draft answers with the music profile so the user can see whether answers confirm or refine the music evidence.”  
**Underneath:** `POST /api/sound-profile/preview` validates answers and calls `fuse()` without inserting a response.

### Screen 7: submit questionnaire

**Show:** submit final answers and navigate to profile.  
**Say:** “Final answers are versioned and append-only. A new sound profile records which music profile and questionnaire response produced it.”  
**Underneath:** `POST /api/questionnaire/responses` checks `perceptual/1`, inserts `questionnaire_responses`, and rebuilds `sound_profiles`.

### Screen 8: profile `/profile`

**Show:** combined curve, music/answers/combined toggles, evidence tags, dimensions, clusters, and notes.  
**Say:** “This line is a personal target relative to Harman IE 2019. It is not saying the user’s true preference has been measured. It is a posterior estimate with uncertainty, and the evidence basis is shown in words.”  
**Underneath:** `sound-profile/3` combines priors, music-derived dB balance, and questionnaire observations.

### Screen 9: recommendations

**Show:** ranked IEMs, predicted preference range, region fits, reasons, measurement source/rig, and target citation.  
**Say:** “The recommendation is based on measured response curves on the same rig family. Each candidate is scored with 256 seeded draws of the user’s target using the Olive in-ear model. The reasons quote the regional error and tolerance used by the rank.”  
**Underneath:** `GET /api/recommendations` loads target/candidates and runs `HarmanPersonalRecommender`.

### Screen 10: method `/method`

**Show:** research/method explanation and limitations.  
**Say:** “The project separates what is measured, derived, model-inferred, heuristic, user-provided, and still hypothetical. The key open question is whether someone’s library predicts their preferred IEM tuning; this implementation makes that hypothesis explicit instead of hiding it.”

## Safe demo fallback

If live YouTube acquisition fails, show the checked-in test fixtures or existing completed submission only if the demo database contains them. Say: “The live external source is unavailable in this environment; the application’s deterministic processing and API contract are demonstrated with the stored fixture.” Do not pretend an external failure is an algorithmic result.

# 16. Viva questions and answers

Each question has a short answer for the room, an expanded answer for follow-up, and the implementation concept to open if challenged.

## Basic

### 1. What is Auralis?

**Short:** Auralis analyses a listener’s music, combines it with questionnaire answers, creates a personal sound target, and matches that target to measured IEMs.

**Expanded:** It is a Next.js/FastAPI application. YouTube links are validated and processed asynchronously. Audio becomes measured features and a library profile; the profile becomes a Bayesian personal target relative to Harman IE 2019; measured IEM frequency responses are ranked against that target with computed explanations.

**Code concept:** `music/pipeline.py` → `analysis/aggregate.py` → `sound_profile/fusion.py` → `recommend/harman.py`.

### 2. What problem does it solve?

**Short:** It makes IEM selection more personal and explainable than choosing from generic labels or population averages.

**Expanded:** Many listeners cannot translate “I like my music” into frequency-response terms. Auralis uses their music as measurable evidence, lets them correct or refine it through plain-language questions, and shows why an IEM matches or misses region by region.

**Code concept:** `SoundProfileData`, `Recommendation`, and `Reason` schemas.

### 3. Who is the intended user?

**Short:** A listener choosing an IEM who can provide public/unlisted YouTube links and answer sound-preference questions.

**Expanded:** The UI is designed for non-experts; engineering terms are kept in the method explanation and implementation, while the questions use bass, vocals, brightness, detail, stage, and naturalness language.

**Code concept:** `questionnaire/definition.py`, `web/src/app/tune/page.tsx`.

### 4. Is Auralis actually AI?

**Short:** It uses statistical modeling and classical unsupervised ML, but not a deep-learning or generative AI model.

**Expanded:** FFT/DSP and librosa produce measurements; PCA/KMeans support curation; a closed-form Bayesian model fuses evidence; the Olive formula is a published statistical model. No PyTorch, MERT, CLAP, or trained supervised recommender is present.

**Code concept:** dependencies in `backend/pyproject.toml`; `sound_profile/fusion.py`; `analysis/curation.py`.

### 5. What is the key innovation?

**Short:** The combination of actual listening-library evidence, explicit uncertainty, rig-aware IEM measurements, and traceable explanations.

**Expanded:** The individual components are grounded in existing audio/recommender research. Auralis’s investigated contribution is the bridge from a person’s music library to a personal IEM target, represented as an explicit hypothesis and evaluated honestly rather than claimed as proven.

**Code concept:** `music-profile/2`, `sound-profile/3`, `harman-personal/1`, and `assumptions.py`.

### 6. What does the complete pipeline do?

**Short:** Link → acquire → decode → measure → curate → aggregate → questionnaire → fuse → compare IEM curves → explain.

**Expanded:** Each stage has a stored or returned artifact and a provenance category. Audio is temporary; analysis is cached by track/version; profiles are immutable snapshots; recommendations preserve candidate measurement provenance.

**Code concept:** the 19-step table in Part 4 and `docs/architecture.md`.

## Architecture

### 7. Why did you use FastAPI?

**Short:** It gives typed validation, OpenAPI, dependency injection, and fits a Python numerical backend.

**Expanded:** The API has route modules for sessions, music, questionnaire, sound profiles, and recommendations. Pydantic models define the contract; the frontend generates types from OpenAPI; worker code stays separate from request latency.

**Code concept:** `auralis/main.py`, router modules, `web/src/lib/api/schema.d.ts`.

### 8. Why Next.js instead of a plain React app?

**Short:** Next.js provides routing and a same-origin `/api` proxy around the React UI.

**Expanded:** It keeps the backend address out of browser code, preserves first-party cookies, and provides structured routes for onboarding, analysis, questionnaire, profile, and method pages.

**Code concept:** `web/next.config.ts` rewrite and `web/src/app` routes.

### 9. Why is the worker asynchronous?

**Short:** Downloads, decoding, and audio analysis are too slow for one HTTP request.

**Expanded:** The API commits the submission and enqueues a job. Worker jobs update state independently so the UI can display progress and retry transient failures. Network and CPU work is outside database transactions.

**Code concept:** `music.ingest`, `music.analyze_track`, `music.build_profile` in `music/pipeline.py`.

### 10. Why use PostgreSQL as the queue?

**Short:** The system already needs PostgreSQL, and row locking plus partial indexes are enough for the current job workload.

**Expanded:** `jobs` stores payload, status, priority, attempts, dedupe key, lock owner, heartbeat, and errors. Workers claim ready rows using a locking strategy; stale running rows can be requeued. This avoids another broker in the current modular monolith.

**Code concept:** `jobs/models.py`, `jobs/queue.py`, migration partial indexes.

### 11. Why is the system a modular monolith instead of microservices?

**Short:** The domains are separated into modules but share one deployment/database, which keeps a college-scale system simpler.

**Expanded:** `analysis` and `acoustics` are pure and independently testable, while API and worker orchestration use database services. Microservices would add deployment, networking, and data-consistency cost without current traffic or team need.

**Code concept:** package layout and `docs/architecture.md`.

### 12. What happens when code changes the analysis algorithm?

**Short:** Derived artifacts carry version identifiers, so new code can rebuild without silently changing old results.

**Expanded:** `ANALYZER_VERSION`, `MUSIC_PROFILE_VERSION`, `MODEL_VERSION`, `FR_PROCESSOR_VERSION`, and `BANDS_VERSION` are stored or exposed. A stale profile can be rebuilt from stored analyses; raw inputs remain available.

**Code concept:** `analysis/version.py`, `sound_profile/service.py`, `iem_acoustic_profiles` uniqueness.

## Audio and signal processing

### 13. How is audio obtained?

**Short:** yt-dlp resolves YouTube metadata and downloads best audio-only streams into a temporary directory.

**Expanded:** URLs are reduced to IDs first. Track selection rejects unavailable, live, too-short, too-long, altered, duplicate, and sampled-out items. Download size is capped at 60 MB and duration at 20 minutes.

**Code concept:** `music/urls.py`, `music/youtube.py`, `music/selection.py`.

### 14. How is audio decoded?

**Short:** PyAV decodes the first audio stream and resamples it to stereo float32 at 44.1 kHz.

**Expanded:** The decoder uses an `AudioResampler` with `format="fltp"`, stereo layout, and 44,100 Hz. It records source codec/rate/channels and truncates output at 600 seconds for long tracks.

**Code concept:** `analysis/decode.py`.

### 15. Why convert to mono for spectral analysis?

**Short:** The long-term tonal spectrum is computed from the average of left and right, while stereo width is measured separately.

**Expanded:** `features.extract()` measures side/mid energy from left/right first, then averages channels for the spectral representation. This avoids throwing away width information while keeping the tonal measurement stable.

**Code concept:** `left/right`, `mid_energy/side_energy`, and `mono = stereo.mean(axis=0)` in `features.py`.

### 16. How is spectral centroid calculated?

**Short:** It is the magnitude-weighted mean frequency over the in-range FFT bins, summarised by p10, median, and p90 across active frames.

**Expanded:** The code takes square roots of power to get magnitude, sums magnitude per frame, and computes `(magnitude @ frequency) / magnitude_sum`. It is a signal statistic used for a heuristic brightness descriptor, not a direct perceptual brightness score.

**Code concept:** `analysis/spectral.py::analyse()`.

### 17. What is RMS in Auralis?

**Short:** RMS is not a named stored feature in the current `TrackFeatures` schema.

**Expanded:** The code does use mean-square energy internally for loudness blocks and spectral power, but it does not expose an `rms` field or use RMS as the current recommendation input. Do not claim “RMS feature” without qualifying it as an internal energy calculation.

**Code concept:** `_block_energy()` in `analysis/loudness.py`; `TrackFeatures` in `features.py`.

### 18. How does Auralis avoid codec artifacts being interpreted as taste?

**Short:** It measures effective bandwidth and tracks coverage per band; music evidence for a band is suppressed when codec coverage is too low.

**Expanded:** In `sound_profile/fusion.py`, `MIN_CODEC_COVERAGE` is 0.5. If less than half the library has adequate coverage for a band, the model does not create a music prior for that band. The UI can still show the measured limitation as uncertainty.

**Code concept:** `effective_bandwidth_hz`, `coverage`, `_music_priors()`.

### 19. Why use MFCCs if they are not used for recommendations?

**Short:** MFCC mean/std provide compact timbre statistics for duplicate detection, outlier detection, and clustering.

**Expanded:** MFCCs are useful for similarity but hard to explain as “the user prefers +X dB.” The project therefore keeps them in the measured feature document but prevents them from driving the tonal target or recommendation rank.

**Code concept:** `TrackFeatures.mfcc_mean/std`, `analysis/curation.py::TIMBRE_COEFFS`.

### 20. What does the audio pipeline not measure?

**Short:** It does not currently measure semantic genre, lyrics, chroma/key, spectral contrast, or a neural embedding.

**Expanded:** It measures low-level spectral, loudness, rhythm, stereo, and timbre statistics. A viva answer should distinguish a measured feature from a human label such as “warm music.”

**Code concept:** `TrackFeatures` fields and `pyproject.toml` dependencies.

## AI/ML and statistics

### 21. Did you train your own model?

**Short:** No supervised recommender was trained. Auralis uses fixed DSP, classical unsupervised ML, a Bayesian fusion model, and a published preference formula.

**Expanded:** PCA/KMeans are fit for curation/evaluation. The profile model uses named priors and closed-form Gaussian updates. The IEM score uses Olive coefficients; Auralis does not fit those coefficients from its own users.

**Code concept:** absence of deep-learning dependencies; `fusion.py`, `curation.py`, `fr.py`.

### 22. Why not MERT?

**Short:** MERT can represent music, but Auralis has no validated mapping from its representation to IEM preference.

**Expanded:** A neural embedding could help group or describe music later. In the current matching path, an embedding would add opacity without labelled outcomes and would not naturally align with the dB frequency-response vocabulary used by IEM measurements.

**Code concept:** `docs/phase2/methodology.md`, no MERT dependency.

### 23. Is PCA machine learning?

**Short:** Yes, PCA is an unsupervised statistical learning method, but here it is used for dimensionality analysis and curation, not prediction from labels.

**Expanded:** PCA finds directions of variance in feature/curve data. KMeans then groups tracks when cluster quality is adequate. There is no target variable such as “liked IEM.”

**Code concept:** `sklearn.decomposition.PCA`, `sklearn.cluster.KMeans` in `curation.py`.

### 24. Why use Bayesian fusion?

**Short:** It combines uncertain sources without a fixed arbitrary percentage and keeps a posterior uncertainty range.

**Expanded:** Music is a conditional prior with a hypothesis correlation; answers are noisy observations with an assumed reliability; the posterior is precision-weighted. Missing evidence leaves the population prior instead of producing a confident guess.

**Code concept:** `_music_prior()`, `_combine()`, `_dimension()` in `fusion.py`.

### 25. What is the most uncertain model parameter?

**Short:** The music–preference correlation `ρ` is the central unvalidated hypothesis.

**Expanded:** The default is `sqrt(0.70)`, but the evaluation sweeps values from negative compensation through zero to positive content matching. The project says a listening study or feedback is needed to estimate it.

**Code concept:** `MUSIC_CORRELATION` in `assumptions.py`; evaluation sensitivity table.

### 26. What does the 0–1 profile value mean?

**Short:** It is an estimated percentile in the assumed population distribution, not a probability or accuracy percentage.

**Expanded:** The code computes `Φ(μ/σ)` from the posterior mean relative to the dimension scale. Confidence is stored separately and described as variance resolved. The UI intentionally uses evidence words rather than invented percentages.

**Code concept:** `_percentile()` and `Dimension.value`.

### 27. Why are music labels like warmth heuristic?

**Short:** They are logistic transforms of calibrated signal z-scores, not validated perceptual models.

**Expanded:** The raw feature layer stays separate. `descriptors.py` documents that brightness, warmth, energy, dynamics, density, and width are transparent summaries designed to be replaceable later.

**Code concept:** `DESCRIPTOR_SPECS`, `describe()`, `calibration.json`.

## Database and data integrity

### 28. Why PostgreSQL instead of a document database?

**Short:** The application needs relational ownership/foreign-key integrity and transactional job state, while JSONB already handles flexible derived documents.

**Expanded:** Users, submissions, tracks, measurements, and profiles have meaningful relations and cascades. JSONB avoids over-normalising large feature vectors while keeping row-level version/provenance fields.

**Code concept:** ORM models and Alembic migrations.

### 29. Why store JSONB features?

**Short:** Feature vectors and profile curves evolve, and JSONB preserves structured documents without creating dozens of narrow tables.

**Expanded:** The database still stores version columns and relational identifiers for lookup. JSONB is not used as an excuse to remove provenance; raw points and derived documents are separately keyed.

**Code concept:** `TrackAnalysis.features`, `MusicProfile.profile`, `SoundProfile.profile`, `IemAcousticProfile.features`.

### 30. How are analyses cached?

**Short:** `track_analyses` is unique by track and analyzer version, so successful and permanent failed analyses can be reused across users.

**Expanded:** The track itself is globally identified by source/source_id; a submission links to it through `submission_tracks`. This avoids downloading the same public recording repeatedly while personal profiles remain user-owned.

**Code concept:** `TrackAnalysis.__table_args__`, `_store_analysis()`, `load_library()`.

### 31. What happens when a user deletes their account?

**Short:** Personal rows cascade from `users`; shared track analyses remain because they are not personal data.

**Expanded:** `DELETE /api/me` deletes the user and commits; database foreign keys with `ondelete="CASCADE"` remove owned profile/submission/session rows. Shared public-track analysis is deliberately not deleted.

**Code concept:** `profiles/service.py::delete_account()` and migration foreign keys.

### 32. How do you preserve measurement provenance?

**Short:** Raw points, checksum, source, source URL/ref, rig, variant, licence, retrieval date, and processor version are stored.

**Expanded:** A derived acoustic profile is keyed by measurement, processor version, and target. If processing changes, a new row/version can be created while the original raw curve remains unchanged.

**Code concept:** `iem/models.py`, `iem/importer.py`, `fr/2`.

## Sound profile

### 33. How do you convert music into a sound profile?

**Short:** Aggregate measured song spectra into dB deviations from a reference corpus, estimate uncertainty, then use those values as a conditional prior for tonal preference dimensions.

**Expanded:** The library is curated first. Weighted median band deviations and bootstrap SEs become z-like music inputs. `_music_priors()` maps appropriate bands to sub-bass, mid-bass, warmth, vocals, treble, air, and energy. The Bayesian posterior then produces the personal curve.

**Code concept:** `aggregate.py::build_profile()` and `fusion.py::_music_priors()`.

### 34. Why is the questionnaire needed if music is available?

**Short:** Music shows content, not every aspect of preference or tolerance.

**Expanded:** A library can reveal spectral balance and some energy, but it cannot reliably reveal whether treble becomes tiring, how important soundstage is, or whether naturalness beats fun. Those dimensions are answer-driven.

**Code concept:** `MUSIC_MEASURES` and questionnaire observation mappings.

### 35. What happens if music and answers disagree?

**Short:** The posterior combines them and labels the relationship as agree, refine, or differ.

**Expanded:** There is no hidden override rule saying one always wins. Their effect follows from the model's variances and reliability. The UI can display music-only, answers-only, and combined layers.

**Code concept:** `_agreement()`, `CurveLayers`, `Basis`.

### 36. Where did the questionnaire weights come from?

**Short:** They are explicit literature-informed mappings and heuristics, not learned weights.

**Expanded:** Bass values use Harman listener-class anchors; other five-point options use equal-probability quantiles; rumble/punch and indirect-answer reliability are hand-designed. The report identifies these choices so they can be tested or replaced.

**Code concept:** `BASS_DB_5`, `EQUAL_5`, `BASS_CHARACTER_DB`, `assumptions.py`.

### 37. Why is the target expressed in dB?

**Short:** IEM frequency responses and the Harman reference are already expressed as relative dB curves, so dB makes music-derived and hardware-derived quantities comparable.

**Expanded:** Tonal dimensions are offsets from Harman IE 2019. Character/priority dimensions stay in standard-deviation units because they are not directly frequency-response offsets.

**Code concept:** `SoundProfileData.curve_reference` and `DimensionSpec.unit`.

### 38. Does the profile know the user’s true preference?

**Short:** No. It estimates a target under explicit assumptions and reports uncertainty.

**Expanded:** It is a model-inferred profile, not a clinical or psychophysical measurement. The true test is whether predictions agree with controlled listening outcomes, which the current project has not collected.

**Code concept:** provenance fields and `docs/phase2/methodology.md` limitations.

## Recommendation engine

### 39. How does Auralis choose an IEM?

**Short:** It filters comparable measured IEMs, scores each against posterior draws of the personal target, and sorts by expected Olive-model preference.

**Expanded:** Candidates must have adequate coverage and matching rig family. Known prices in the user's currency are budget-filtered. The output includes mean/10th/90th score, regional fit, and provenance.

**Code concept:** `HarmanPersonalRecommender.recommend()` and `score()`.

### 40. What is the similarity metric?

**Short:** The default rank is not a generic cosine similarity; it is the Olive predicted-preference formula over the candidate error curve relative to the personal target.

**Expanded:** The formula uses SD, absolute log-frequency slope, and aligned mean absolute error. `band-rms/1` exists as a comparison recommender but is not the default.

**Code concept:** `fr.olive_terms()`, `fr.olive_score()`, `BandRmsRecommender`.

### 41. Why use posterior draws?

**Short:** A point estimate hides uncertainty; draws show how the expected rank changes across plausible personal targets.

**Expanded:** The system draws 256 deterministic samples per dimension, keeps linked bands correlated through shared dimensions, and reports a 10–90% score range. This is uncertainty in the model's target, not a guarantee of listener-rating accuracy.

**Code concept:** `curve_draws()`, `offsets_on()`, `Prediction`.

### 42. How are budget constraints applied?

**Short:** A candidate is removed only when its price and the user's currency are known and the amount is outside the range.

**Expanded:** Unknown or foreign-currency prices remain eligible and receive an explanation that the budget was not checked. There are no exchange rates. In the audit snapshot, zero prices meant budgets could not be applied.

**Code concept:** `_within_budget()` and `constraints_for()`.

### 43. Why does the same IEM rank differently for two users?

**Short:** The measured response is the same, but each user has a different posterior personal target.

**Expanded:** The candidate error is recalculated against each target. A bass-forward IEM can improve for a bass-preferring target and worsen for a bass-light target even though its population score is unchanged.

**Code concept:** `error_ref - personal_mean` and per-profile `curve_draws()`.

### 44. Why should the evaluator trust the explanation?

**Short:** The explanations are generated from the same numerical errors and tolerances used by the scoring path.

**Expanded:** `RegionFit` stores the computed error and tolerance; `_reasons()` inserts those values into the message. The checked-in evaluation reports a 100% consistency audit for 170 quantitative reasons. That validates traceability, not user preference accuracy.

**Code concept:** `Reason`, `RegionFit`, `_reasons()`.

## Security and performance

### 45. How do you prevent SSRF through submitted URLs?

**Short:** The parser accepts only supported YouTube hosts and reconstructs canonical YouTube URLs from validated IDs; yt-dlp is also restricted to YouTube extractors.

**Expanded:** It rejects credentials, unusual ports, unsupported schemes, evil subdomains, malformed IDs, and arbitrary hosts before network access. The original raw URL is not passed to yt-dlp.

**Code concept:** `parse_youtube_url()`, `YouTubeRef.canonical_url`, `_base_options()`.

### 46. How is CSRF handled?

**Short:** Unsafe API methods require `x-auralis-client: web`, and the frontend adds it automatically.

**Expanded:** Browsers cannot attach that custom header to a simple cross-site form post; cross-origin fetch would require preflight handling that the API does not approve. SameSite=Lax session cookies provide an additional boundary.

**Code concept:** `CsrfHeaderMiddleware` in `main.py` and `clientHeader` in frontend client.

### 47. What is the main performance bottleneck?

**Short:** External download plus CPU audio analysis is the main bottleneck, not the short profile/recommendation calculation.

**Expanded:** The worker bounds duration and uses concurrency 3. The dated audit measured around 4.2 s median download and 7.1 s median analysis. Recommendation scans are comparatively fast for the audited 203-candidate dataset.

**Code concept:** `acquire.py`, worker settings, audit report.

### 48. Can this support 10,000 users today?

**Short:** Not demonstrated. The current modular monolith and three-worker default are suitable for a prototype/demo scale, not proven for 10,000 concurrent users.

**Expanded:** At larger scale, YouTube limits, CPU workers, database connections, JSONB growth, external storage, queue throughput, rate limiting, observability, and data retention would need engineering. Those are future requirements, not current claims.

**Code concept:** `config.py`, `jobs`, `docker-compose.yml`, audit limitations.

## Research and critical questions

### 49. What is the research gap?

**Short:** Research supports music representation and headphone preference modeling separately, but not the direct link from personal music libraries to personal IEM preference.

**Expanded:** Auralis makes that bridge an explicit correlation hypothesis, runs sensitivity tests, and proposes a controlled virtual-headphone study to estimate it. It does not claim existing papers prove the product.

**Code concept:** `MUSIC_CORRELATION`, `docs/phase2/research.md` section 3.

### 50. What validates the implementation?

**Short:** Tests cover the code, and the checked-in evaluation compares Olive statistics against AutoEq and tests stability/sensitivity, but no user-outcome validation exists.

**Expanded:** The audit reports 139 backend tests, 34 frontend tests, and 6 browser tests in its dated run. The current environment reproduced 34 frontend tests and TypeScript typechecking; backend execution was blocked by unavailable PostgreSQL test infrastructure in this workspace. Regardless, passing implementation tests does not prove recommendation validity.

**Code concept:** `backend/tests`, `web/*.test.ts`, `docs/phase2/evaluation.md`.

### 51. What proves music preference predicts IEM preference?

**Short:** Nothing in the current project proves that; it is the central research hypothesis.

**Expanded:** The evaluation shows that music changes rankings and that the pipeline responds monotonically to controlled target shifts. That demonstrates information flow and model behavior, not that users will prefer the resulting IEMs.

**Code concept:** evaluation ablation/sensitivity tables and `research.md` section 3.

### 52. Why is spectral centroid not simply brightness?

**Short:** Centroid is a magnitude-weighted frequency statistic; “brightness” is a heuristic interpretation that depends on context.

**Expanded:** A mix with one high-frequency component can have a high centroid without sounding bright in the same way as another mix. Auralis labels brightness as a calibrated heuristic and retains centroid as the raw measured value.

**Code concept:** `SpectralStats.centroid_hz` versus `descriptors.py::DESCRIPTOR_SPECS`.

### 53. How do you know a user likes the music they submit?

**Short:** You do not know from a link alone; the system treats it as selected-listening evidence, not verified liking or play-count behavior.

**Expanded:** A user might paste a playlist for exploration or someone else’s music. This is a real limitation. A future study or consented listening-history integration would test whether selection strength, repeat count, or explicit confirmation improves the signal.

**Code concept:** submissions contain links/tracks, not play counts or ratings.

### 54. Are the sound-profile labels scientifically validated?

**Short:** The raw measurements and dB target offsets are explicit; labels such as warmth, energy, and brightness are documented heuristics.

**Expanded:** They are useful UI vocabulary but not psychophysical measurements. The project separates `measured`, `derived`, `model_inferred`, `heuristic`, and `user_provided` provenance precisely to avoid overstating them.

**Code concept:** `Provenance` and `DESCRIPTOR_SPECS`.

### 55. What part is your own contribution?

**Short:** The engineering contribution is the end-to-end integration, versioned data/provenance design, music-to-profile hypothesis, uncertainty-aware fusion, rig-aware matching, and computed explanation layer.

**Expanded:** The project does not claim to have invented FFT, Harman research, or the Olive model. Its contribution is adapting established components into a working, inspectable product and clearly isolating the unvalidated bridge as a research question.

**Code concept:** the complete flow across `music`, `analysis`, `sound_profile`, `iem`, and `recommend`.

# 17. Trick questions

### “Isn’t spectral centroid just brightness?”

**Strong answer:** It is a proxy-like signal statistic, not brightness itself. Auralis keeps the centroid measured and labels the brightness descriptor as heuristic. The correct claim is “centroid contributes to a brightness summary calibrated against this corpus,” not “centroid proves brightness.”

### “How do you know the listener likes all submitted music?”

**Strong answer:** We do not know. Auralis assumes submitted music is useful evidence because it is user-selected, but it does not observe play counts or explicit liking. This is a limitation and a future data-collection opportunity.

### “Why should music preference predict IEM preference?”

**Strong answer:** It may not. Content matching and compensation are both plausible. The code makes the link a single parameter `ρ`, sweeps it in evaluation, and says a listening study is required. The papers support the components, not this bridge.

### “Where did the weighting values come from?”

**Strong answer:** Some are literature-informed, such as bass/treble prior spread and the 0.70 answer reliability borrowed from single-item research. Others are explicitly assumptions: mid/air spreads, indirect factor, rumble/punch tilt, and the default music correlation. They are centralized in `assumptions.py` and sensitivity-tested.

### “Did you train your own model?”

**Strong answer:** No supervised recommender or neural network. We use deterministic DSP, PCA/KMeans for unsupervised structure, a closed-form Bayesian model, and the published Olive regression formula.

### “What dataset did you train on?”

**Strong answer:** No training dataset exists for the deployed recommender. The project has a 30-track calibration corpus for descriptor scaling and imported IEM/target measurements for matching, but no user–IEM outcome labels.

### “How do you validate recommendations?”

**Strong answer:** Current evaluation validates implementation fidelity, stability, sensitivity, ablation, and explanation consistency. It does not validate whether people like the recommendations. That needs a controlled listening study.

### “What happens if two users have identical music?”

**Strong answer:** Their music evidence will be similar, but questionnaire answers, budgets, measurement availability, and model version can still produce different profiles/ranks. If all evidence and constraints are identical, the deterministic model should produce the same ranking.

### “Why can’t Spotify or YouTube already do this?”

**Strong answer:** Those services optimize content discovery or playback, not measured IEM frequency-response matching. Auralis joins personal listening evidence to an acoustic hardware dataset and explains the response error. It is not claiming the platforms could not build such a feature.

### “How is this different from a normal IEM recommender?”

**Strong answer:** A normal recommender may use reviews, popularity, or manually chosen sound labels. Auralis uses measured response curves, a personal target with uncertainty, same-rig filtering, and reasons generated from numerical region errors. Its personalization hypothesis is explicit and unvalidated.

### “Are your measurements comparable across rigs?”

**Strong answer:** The code refuses to compare a candidate unless its rig family matches the target and constraint rig family. Current target/candidate import is limited to the `iec60318-4` family. This avoids false precision but limits the catalogue.

### “Are your sound-profile labels scientifically validated?”

**Strong answer:** No. The raw features and dB offsets are reproducible; descriptive labels such as warmth and brightness are documented heuristics. We would validate them with listener ratings in future work.

### “Is this actually AI?”

**Strong answer:** It is an applied audio-intelligence system, but not deep AI. The honest technical description is DSP + statistics + classical unsupervised ML + Bayesian inference + a published preference model.

### “What is the weakest claim in the project?”

**Strong answer:** That music balance predicts preferred IEM balance. It is encoded as `music_correlation` and the project openly calls it a hypothesis.

### “What happens if the user's music is completely different?”

**Strong answer:** The representation is relative to a 30-track reference corpus, so unusual content can create large dB deviations. Curation preserves clusters and down-weights outliers, but the model still assumes the library is informative. More diverse calibration and outcome data would help.

### “Does the model understand lyrics or emotions?”

**Strong answer:** No. The current feature schema has no lyrics, language, semantic emotion classifier, or MERT embedding. It measures acoustic signal and rhythm/timbre statistics.

### “Why not use price as a quality score?”

**Strong answer:** The current code treats price only as an optional constraint, not as preference evidence. Prices are observations with source/date and are not used to inflate a rank.

### “Can your score exceed 100?”

**Strong answer:** The `OliveStats.score` description says it may exceed 100 because the formula is applied directly; the output is a model score, not a hard probability or guaranteed bounded human rating.

### “Why do you call air unreliable?”

**Strong answer:** The target/model and IEC 60318-4 validity are reliable mainly through about 10 kHz. Auralis reports air-region data but marks it unreliable and does not use it as a scored region in the same way.

# 18. 30-second, 1-minute, and 3-minute explanations

## 30 seconds

Auralis is a personal audio recommendation system. A listener pastes music links, and the system measures the songs’ spectral and loudness characteristics. It aggregates those measurements into a music profile, refines it with a simple sound questionnaire, and creates a personal target curve. It then compares that target with measured IEM frequency responses and explains why the top matches fit in bass, mids, vocals, and treble. The system is transparent about uncertainty and does not claim that the music-to-IEM link has been scientifically proven yet.

## 1 minute

Auralis helps a listener choose an IEM without requiring them to understand frequency-response graphs. The Next.js frontend sends validated YouTube video or playlist IDs to a FastAPI backend. A PostgreSQL-backed worker resolves and selects tracks, temporarily downloads audio, decodes it with PyAV, and extracts deterministic features using NumPy, SciPy, librosa, and soxr. Duplicates are counted once, outliers are down-weighted, and the library is summarised as dB balance relative to a reference corpus with bootstrap uncertainty. A questionnaire adds information music cannot show, such as treble tolerance and soundstage priority. A closed-form Bayesian model fuses the evidence into a personal target relative to the Harman in-ear 2019 curve. Measured IEM responses from a compatible rig are scored using the published Olive in-ear model, and each result includes numerical region errors and provenance. The key research gap is whether listening-library balance predicts preferred IEM tuning; Auralis treats that as a hypothesis, not a proven fact.

## 3 minutes

Auralis is a modular monolith with a Next.js web app, FastAPI API, PostgreSQL database, and a database-backed worker. The journey starts with an anonymous session. The user submits YouTube links; the URL parser accepts only supported YouTube forms and stores canonical IDs. The ingest job resolves metadata through yt-dlp, removes unavailable, live, altered, too-short, too-long, duplicate, and sampled-out items, and reuses cached analyses by track and analyzer version.

For each new track, the worker downloads an audio-only stream into a temporary directory. PyAV decodes the first audio stream to stereo float32 at 44.1 kHz, truncating long tracks at ten minutes. After silence trimming and validation, Auralis measures BS.1770-style loudness, loudness range, peak/headroom, nine-band power-per-octave balance relative to 500 Hz–2 kHz, a long-term spectrum, spectral centroid, rolloff, flatness, stereo side-to-mid energy, tempo, onset rate, percussive ratio, MFCC statistics, and effective bandwidth. These are measured features, not automatically interpreted emotions or preferences.

At library level, duplicate recordings count once, atypical tracks are down-weighted, and sonic clusters are kept visible. The profile uses weighted medians, weighted quantiles, and a 400-resample seeded bootstrap. The resulting `music-profile/2` document contains band dB deviations from a disclosed 30-track calibration corpus, bootstrap standard errors and intervals, descriptors, spectrum, clusters, and notes about codec coverage. If most tracks have lost their air content, the model refuses to interpret that absence as a preference.

The questionnaire is versioned and uses listener language. `sound-profile/3` models tonal preference as dB offsets from the Harman in-ear 2019 target. Music shifts a Gaussian prior through one correlation parameter, answers become noisy observations with reliability, and precision-weighted fusion produces a posterior mean and standard deviation for each dimension. This is not a trained neural model. It is an explicit statistical model with assumptions stored in the profile. The output contains music-only, answers-only, and combined curves, evidence basis, and an 80% range.

For recommendations, Auralis imports raw IEM measurements and Harman targets through a pinned AutoEq commit, preserves provenance, validates coverage, interpolates to a 1/48-octave log grid, normalises at 500 Hz, and computes measurement-minus-target error curves. Candidates are restricted to the target’s rig family. The Olive model uses SD, absolute log-frequency slope, and aligned mean absolute error. The recommender evaluates every candidate over 256 seeded posterior draws of the user’s target, ranks by expected predicted preference, reports a 10–90% score range, and explains the strongest regional matches and mismatches from the same errors. The implementation is testable and the checked-in evaluation reproduces published scores closely, but real recommendation validity still requires a listening study with user–IEM outcomes.

# 19. Final viva cheat sheet

## Project definition

Personal audio intelligence that transforms a listener’s music and answers into an explainable IEM target and ranked matches.

## Problem

Listeners often cannot translate music taste into IEM frequency-response preferences, and generic recommendations hide their evidence.

## Solution

Measure submitted music, curate and aggregate it, fuse it with questionnaire evidence, compare a personal target to measured IEM curves, and explain the result numerically.

## Architecture

Next.js/React frontend → same-origin `/api` proxy → FastAPI → PostgreSQL + database-backed worker → yt-dlp/PyAV/NumPy/SciPy/librosa → profiles/recommender.

## Complete stack to remember

Python, FastAPI, Pydantic, SQLAlchemy, PostgreSQL, Alembic, yt-dlp, PyAV, NumPy, SciPy, librosa, soxr, scikit-learn, Next.js, React, TypeScript, Tailwind, Motion, TanStack Query, openapi-fetch, Vitest, Playwright.

## Key algorithms

- strict YouTube URL parsing and canonicalization;
- metadata filtering and even playlist sampling;
- PyAV decode/resample;
- BS.1770-style K-weighted loudness and EBU-style loudness range;
- 8,192-point STFT/FFT and nine-band power-per-octave spectrum;
- weighted medians, robust z-scores, bootstrap SE/90% intervals;
- PCA/KMeans curation;
- closed-form Gaussian/Bayesian fusion;
- FR validation, 1/48-octave interpolation, 500 Hz normalisation;
- Olive SD/slope/AAE preference formula;
- 256 seeded posterior draws and expected-score ranking.

## AI/ML answer

No deep-learning model is deployed. The system uses deterministic DSP, classical unsupervised ML, Bayesian inference, and a published statistical preference model. MERT is research context only.

## Database answer

PostgreSQL stores users, submissions, tracks, shared versioned analyses, profiles, raw FR measurements, targets, processed acoustic profiles, prices, and jobs. JSONB stores flexible versioned documents; foreign keys preserve ownership/provenance.

## Research papers answer

Fricke supports computer-extracted music-feature preference measurement. MERT demonstrates strong learned music representation but is not used. Olive Part 1 supports the Harman IE target and listener-test basis. Olive Part 2 supports the in-ear preference formula. Olive 2019 supports listener segmentation/individual variation. None proves the direct music-library-to-IEM-preference link.

## Research gap

Whether a person’s actual listening-library balance predicts the IEM tuning they prefer remains unvalidated. Auralis exposes it as `music_correlation` and proposes controlled listening/feedback data.

## Key innovation

End-to-end integration with interpretable dB representations, explicit uncertainty, measurement provenance, same-rig matching, and traceable explanations.

## Limitations to volunteer first

No user–IEM outcome dataset; unvalidated `ρ`; questionnaire reliability borrowed from another field; small 30-track corpus; YouTube source variability; one main measurement source/rig family; descriptors and several mappings are heuristics; price data may be absent; no large-scale deployment proof.

## Twenty most important answers

1. Auralis turns music plus answers into a personal IEM target.
2. The current backend is FastAPI/Python/PostgreSQL; frontend is Next.js/React/TypeScript.
3. Audio is downloaded temporarily and deleted after extraction.
4. Decode is stereo float32 at 44.1 kHz; rhythm/timbre path is 22.05 kHz.
5. The system extracts measured features, then separate heuristic descriptors.
6. The nine bands are a versioned project convention.
7. Weighted medians resist extreme tracks.
8. Bootstrap intervals express library uncertainty.
9. Duplicates count once; outliers are down-weighted, not silently removed.
10. Music evidence does not speak for treble tolerance or priorities.
11. `sound-profile/3` is closed-form Bayesian fusion, not a neural network.
12. `ρ` is the unvalidated music-to-preference hypothesis.
13. The target is Harman IE 2019 plus personal dB offsets.
14. Raw IEM FR and provenance are kept separate from derived profiles.
15. Measurements are compared only within the same rig family.
16. Olive score uses SD, absolute slope, and aligned AAE.
17. Ranking uses expected score over 256 seeded posterior draws.
18. Explanations come from the same regional errors used for ranking.
19. Prices only constrain known same-currency candidates; zero prices means no budget filtering.
20. Passing tests and reproducing published scores do not prove real-user recommendation validity.

# 20. Evidence and code map

## Primary implementation files

| Topic | Files |
|---|---|
| App/config/database | `backend/src/auralis/main.py`, `config.py`, `db.py`, `models.py` |
| Auth/profile | `auth/*.py`, `profiles/*.py` |
| Music routes and acquisition | `music/router.py`, `service.py`, `urls.py`, `youtube.py`, `acquire.py`, `selection.py` |
| Worker pipeline | `music/pipeline.py`, `jobs/queue.py`, `jobs/worker.py`, `jobs/registry.py` |
| Audio analysis | `analysis/decode.py`, `loudness.py`, `spectral.py`, `features.py` |
| Descriptors/curation/aggregation | `analysis/descriptors.py`, `curation.py`, `aggregate.py`, `version.py` |
| Questionnaire | `questionnaire/definition.py`, `router.py`, `models.py` |
| Sound model | `sound_profile/assumptions.py`, `fusion.py`, `service.py`, `router.py` |
| IEM/FR | `acoustics/bands.py`, `acoustics/fr.py`, `iem/models.py`, `iem/importer.py`, `iem/datasets.py`, `iem/catalog.py` |
| Recommendation | `recommend/base.py`, `harman.py`, `band_rms.py`, `service.py`, `router.py` |
| Frontend/API | `web/src/app/*`, `web/src/lib/api/client.ts`, `hooks.ts`, `web/next.config.ts` |
| Schema | `backend/migrations/versions/*.py` |

## Project documentation used

- `README.md` — setup, operator commands, scope, privacy principles.
- `docs/architecture.md` — module/data-flow architecture and versioning.
- `docs/decisions.md` — design decisions and rationale.
- `docs/phase2/research.md` — research claims, adopted principles, references, and gap.
- `docs/phase2/methodology.md` — exact representation, Bayesian model, FR processing, matching, and ML decision.
- `docs/phase2/evaluation.md` / `.json` — dated evaluation outputs.
- `docs/audit-report.md` — dated system audit, data snapshot, test/performance/security observations.

## External research references

- Fricke et al. (2018): [doi:10.1016/j.jrp.2018.06.004](https://doi.org/10.1016/j.jrp.2018.06.004)
- MERT (ICLR 2024): [ICLR paper page](https://proceedings.iclr.cc/paper_files/paper/2024/hash/33dffa2e3d2ab74a783d1a8c292f66d9-Abstract-Conference.html)
- Olive Part 1 (AES 143, 2017): [AES paper 9840](https://aes.org/publications/elibrary-page/?id=19237)
- Olive Part 2 (AES 143, 2017): [AES paper 9878](https://aes.org/publications/elibrary-page/?id=19275)
- Olive et al. (2019): [AES paper 10156](https://aes.org/publications/elibrary-page/?id=20289)

## Final statement for the viva

Auralis is strongest when presented as an honest, inspectable engineering and research prototype: the audio pipeline, data provenance, versioning, API flow, IEM processing, and recommendation mathematics are concrete and testable. The music-to-personal-IEM link is the research hypothesis under investigation, not an established scientific fact. That distinction is a strength of the project’s methodology, not a weakness to hide.
