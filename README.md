# Aurals (Auralis)

Auralis is a personal audio intelligence platform. It analyzes music from YouTube links alongside listener preferences to create an explainable sound profile relative to the Harman target. Using acoustic science, it matches that profile against lab-measured In-Ear Monitor (IEM) curves to deliver transparent hardware recommendations.

**Personal audio intelligence.** Auralis analyses the music someone actually listens to,
combines it with what they say they like, and builds a versioned, explainable
*personal sound profile*. The next step is to match that profile against measured
in-ear monitors (IEMs) and explain every recommendation.

```
YouTube links ─▶ ingestion ─▶ temporary audio ─▶ feature extraction ─▶ curation
      ─▶ music profile (what the library contains: the primary evidence)
      ─▶ refined by a questionnaire (what the listener says) ─▶ personal sound profile
      ─▶ measured IEMs (oratory1990 via AutoEq, IEC 60318-4) vs Harman in-ear 2019 target
      ─▶ personal target ─▶ Olive et al. preference model ─▶ explained matches
      ─▶ [next] feedback ─▶ estimate the model's open parameters
```

What works today:

- Onboarding: landing → name → paste songs/playlists → live analysis → questionnaire →
  "Your sound".
- A real pipeline: URL validation, yt-dlp metadata, de-duplication and sampling,
  temporary download, decoding with PyAV, BS.1770 loudness, long-term spectra in nine
  bands, rhythm and timbre features. Analyses are cached per track, and the audio is
  deleted after analysis.
- Library curation: duplicate recordings, down-weighted outliers, sonic clusters.
- A personal sound profile: a Bayesian model in dB relative to the Harman in-ear target,
  with the music as a conditional prior and answers as noisy observations. Every
  assumption is named, sourced and swept in the evaluation; the UI shows evidence in
  words, never invented percentages.
- Measured IEM matching: 211 in-ear measurements with full provenance, processed the
  Harman way and ranked with the published preference model against each listener's
  personal target, with reasons computed per frequency region.
- An evaluation suite (`auralis evaluate`) and a written methodology:
  [docs/phase2](docs/phase2/).
- An IEM data layer: raw frequency-response (FR) measurements with provenance, a
  processing pipeline onto a common grid, and a tested content-based recommender that
  explains itself. No IEM data is bundled, and none is invented.

## Repository

| Path | What |
| --- | --- |
| `web/` | Next.js 16 app (TypeScript, Tailwind 4, Motion, TanStack Query, typed API client) |
| `backend/` | FastAPI API, job worker and the analysis library (Python 3.13, `uv`) |
| `backend/calibration/` | The corpus behind the descriptor calibration (video IDs and genres) |
| `scripts/` | `dev.py` runs the whole stack; `devdb.py` runs PostgreSQL without Docker |
| `docs/` | [Architecture](docs/architecture.md) and [decisions](docs/decisions.md) |

## Running locally

Requirements: Python 3.12+ with [uv](https://docs.astral.sh/uv/), Node 20.9+ (Node is also
the JavaScript runtime yt-dlp needs for YouTube; Deno works too), and PostgreSQL 16+.
No system ffmpeg is needed, because PyAV ships its own.

```bash
# 1. Database: either Docker…
docker compose up -d db
#    …or local binaries (e.g. conda create -p .devtools/pg -c conda-forge postgresql)
python scripts/devdb.py init

# 2. Dependencies
(cd backend && uv sync)
(cd web && npm install)

# 3. Everything: migrations, API :8000, worker, web :3000
python scripts/dev.py up
python scripts/dev.py status | logs | down
```

Open http://localhost:3000. The API docs are at http://localhost:8000/api/docs.

### One-click Windows launcher and ngrok sharing

Double-click [`Start-Auralis.cmd`](Start-Auralis.cmd). On first run it creates the local
environment, installs backend/frontend dependencies, starts PostgreSQL, launches the API,
worker pool and web app, downloads ngrok, and asks for an ngrok authtoken. It then prints a
public HTTPS URL forwarding to the local web app. The launcher uses 9 analysis workers.

The public URL exposes the development app to the internet. Use it only for controlled demos;
do not put production secrets or private data in this development tunnel.
Settings are environment variables prefixed `AURALIS_`; see [`.env.example`](.env.example).

Running pieces by hand:

```bash
cd backend
uv run alembic upgrade head
uv run uvicorn auralis.main:app --reload     # API
uv run auralis worker --concurrency 3        # background analysis
cd ../web && npm run dev                     # web, proxies /api to the API
```

## Quality checks

```bash
cd backend
uv run ruff check src tests migrations && uv run ruff format --check src tests migrations
uv run mypy                     # strict
uv run pytest                   # unit + PostgreSQL integration (auralis_test database)

cd web
npm run lint && npm run typecheck && npm run format:check
npm test                        # vitest
npm run test:e2e                # Playwright, against a running stack (no YouTube needed)
npm run build
```

After changing API schemas, regenerate the client types with `npm run api:types` (the API
must be running).

## Operator commands

```bash
uv run auralis import-autoeq            # Harman targets + oratory1990 in-ear data (pinned commit)
uv run auralis import-catalog data.csv  # sourced prices/specs; template: data/iem-catalog.template.csv
uv run auralis rebuild-profiles         # re-derive profiles after a model change (no downloads)
uv run auralis evaluate                 # writes docs/phase2/evaluation.md and .json
uv run auralis calibrate calibration/corpus-2026-09.tsv    # rebuild descriptor calibration
uv run auralis import-fr curve.csv --brand B --model M     --source "Who measured it" --rig "IEC 60318-4" --license "…"
```

Only import measurements you are allowed to use, with their real source. Downloaded
datasets are cached under `.devtools/data` (git-ignored), never committed.

## Principles

- **Measured, inferred and unknown are kept apart.** Raw features are stored next to
  heuristic descriptors. Each descriptor carries a version and a calibration ID, and
  missing data stays missing.
- **Music leads, answers refine, assumptions are named.** What you play sets the
  conditional prior for what it can measure; answers update it; the one untested link
  (does library balance predict preferred tuning?) is an explicit parameter with a
  sensitivity analysis. Every number is labelled measured, derived, model-inferred,
  heuristic or user-provided.
- **Privacy by default.** No account details are required. Session tokens are stored
  hashed, audio is temporary, links are reduced to IDs before any fetch, and one click
  deletes a user's data.

## What's next

1. A listening study (virtual-headphone method) to validate personal predictions and
   estimate the model's open parameters: the music–preference correlation ρ and the
   answer reliability.
2. Collect feedback on real IEMs (`FeedbackSignal` is already supported by the model).
3. Sourced prices and specs for the measured catalogue; more measurers on the same rig
   family.
4. Adaptive questioning from the posterior's expected information gain.
5. A review-intelligence module, kept separate from measurements.
