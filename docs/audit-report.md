# Auralis — project audit report

Audited 2026-09-28 against the running system. Shared copy (living document):
https://claude.ai/code/artifact/a5eac38b-97d7-4700-842c-fb507c5348e4

Auralis runs end to end and its method is documented, reproducible and independently
checked: 139 backend tests, 34 unit tests and 6 browser tests pass, and the earphone
scoring reproduces published reference values (r = 0.9998). The three material risks
are that the project has no version-control history, that two central model parameters
are unvalidated by design, and that the earphone catalogue carries no prices, so budget
filtering is inert.

## Architecture

A modular monolith: one Python package behind one API, one Next.js app, one PostgreSQL
database, and background workers that share that database instead of a separate broker.

| Runtime piece | Technology | Responsibility |
| --- | --- | --- |
| Web app | Next.js 16, React 19, Tailwind 4 | Pages, visualisation, proxies `/api/*` so the API address never reaches the browser |
| API | FastAPI, Pydantic 2, SQLAlchemy 2 | Sessions, submissions, questionnaire, profiles, recommendations; 17 endpoints, 57 schemas |
| Worker | Same package, `auralis worker` | Link resolution, download, analysis, aggregation; 3 processes by default, 9 on this machine (`AURALIS_WORKER_CONCURRENCY`) |
| Database | PostgreSQL 18 | All state, including the job queue (`FOR UPDATE SKIP LOCKED`, dedupe keys, heartbeats) |

Backend: 9,030 lines across 13 modules. Web: 9,296 lines.

| Module | Lines | Owns |
| --- | --- | --- |
| `music` | 1,811 | URL parsing, YouTube resolution, download, ingestion pipeline, submission API |
| `analysis` | 1,445 | Decoding, loudness, spectra, features, curation, library aggregation |
| `sound_profile` | 1,135 | The personal Bayesian model and its named assumptions |
| `evaluation` | 1,063 | The evaluation suite behind `auralis evaluate` |
| `recommend` | 864 | Candidate loading, matching, ranking, explanations |
| `iem` | 687 | Catalogue, measurement import, dataset provenance |
| `jobs` | 410 | PostgreSQL job queue and worker loop |
| `acoustics` | 371 | Frequency bands and measurement processing (`fr/2`) |
| `profiles`, `questionnaire`, `auth`, `core`, `tools` | 839 | Listener profile, questions, sessions, errors, maintenance |

The frontend's API client is generated from the backend's OpenAPI schema, so a contract
break fails the frontend type check.

## Data model

Seventeen tables, two migrations. Raw data is kept as received, derived results are
immutable rows tagged with the producing code version, and unknown stays NULL.

| Group | Tables |
| --- | --- |
| Identity | `users`, `sessions`, `profiles` |
| Music input | `music_submissions`, `submission_sources`, `submission_tracks`, `tracks` |
| Analysis | `track_analyses` (shared across listeners; public recordings, no personal data) |
| Derived profiles | `music_profiles`, `questionnaire_responses`, `sound_profiles` |
| Earphones | `iems`, `fr_measurements`, `fr_targets`, `iem_acoustic_profiles`, `iem_price_observations` |
| Work | `jobs` |

Deleting an account cascades through every table holding personal data and leaves
shared analyses intact (tested).

## Pipelines

- **Audio analysis (`analyzer/1`)** — links reduced to `(kind, id)` before any fetch;
  temporary download, PyAV decode, BS.1770 loudness, nine-band LTAS relative to
  500 Hz–2 kHz, effective bandwidth, rhythm and timbre features; audio deleted after
  measurement; failures recorded with a reason.
- **Library aggregation (`music-profile/2`)** — duplicates once, outliers down-weighted,
  per-band deviation from a 30-track reference corpus as a weighted median with a seeded
  bootstrap SE and 90 % interval; codec-limited bands excluded from taste inference.
- **Personal model (`sound-profile/3`)** — Gaussian posterior in dB relative to the
  Harman in-ear 2019 target: population prior, music as a conditional prior through one
  correlation parameter, answers as noisy observations. Tolerance and priorities take no
  music input.
- **Measurement processing and matching (`fr/2`, `harman-personal/1`)** — validate,
  1/48-octave grid with gaps preserved, normalise at 500 Hz, error against a rig-matched
  target; ranking by the published in-ear preference model over 256 seeded posterior
  draws; reasons generated from the per-region errors that produced the score.

## Method and provenance

Five labels, exposed by the API: `measured`, `derived`, `model_inferred`, `heuristic`,
`user_provided`.

| Assumption | Value | Status |
| --- | --- | --- |
| Music–preference correlation | 0.837 | hypothesis (no study links library balance to preferred tuning) |
| Answer reliability | 0.70 | literature-informed (single-item self-report floor, another field) |
| Population spread, bass / treble | 3.0 / 2.5 dB | literature-informed (Harman classes, demographics) |
| Population spread, mids / air | 1.5 / 2.5 dB | assumption |
| Indirect answer factor | 0.5 | assumption |

## Evaluation (`auralis evaluate`)

| Question | Result |
| --- | --- |
| Scoring implemented correctly? | r = 0.9998 vs AutoEq's published scores, 203 earphones |
| Reference corpus plausible? | 4.9 dB/octave decay, vs ~5 dB/octave in the literature |
| Library balance stable? | Sub-bass 90 % interval: ~20 dB at 5 songs → 2.9 dB at 80 |
| Music carries information? | Bass-forward vs acoustic genres differ 22.6 dB in sub-bass, p = 0.007 |
| Rankings respond correctly? | Spearman 1.0 (bass), 0.99 (treble) |
| Agrees with the published method? | Kendall τ = 0.96 with no listener evidence |
| Source contribution | Music changes 3–4 of a top 10; alone it moves 1–2 |
| Assumption sensitivity | Priors ≥ 0.83 overlap; answer reliability and ρ 0.60–0.75 |
| Explanations true? | 170 of 170 reasons re-derived from raw curves |
| Tuning structure (PCA) | Bass shelf 55 %, tilt 16 % |

## Quality and verification (re-run 2026-09-28)

| Check | Result |
| --- | --- |
| `pytest` (incl. PostgreSQL integration) | 139 passed |
| Backend coverage | 83 % of 4,285 statements |
| `mypy` (strict) | Clean, 76 files |
| `ruff` check and format | Clean |
| `vitest` | 34 passed |
| `tsc` | Clean |
| `playwright` (desktop + mobile) | 6 passed |
| `next build` | Succeeds, 9 routes |

Coverage is lowest where code touches the network or writes reports (dataset importer
and report writer at 0 %). Browser tests are not in CI; the visualisation components
have no component tests; CI has never executed because there are no commits.

## Security and privacy

| Area | State |
| --- | --- |
| Sessions | 256-bit token, HttpOnly/SameSite=Lax/Secure-in-production cookie; only a SHA-256 hash stored; forged-cookie test |
| CSRF | Custom header required on state-changing requests; tested |
| SSRF | Input reduced to an id and rebuilt canonically; yt-dlp restricted to YouTube extractors |
| Authorisation | Queries scoped to the session user; cross-user access returns 404; tested |
| Personal data | Display name only; audio deleted after analysis; account deletion cascades |
| Secrets | Database URL only, from the environment, never in the browser |
| Headers | nosniff, DENY framing, referrer and permissions policies; artwork proxied |
| Abuse limits | 20 links / 120 tracks / 60 MB / 20 min per track; 2 active submissions (429 beyond) |

Gaps: no rate limiting, no Content-Security-Policy, no structured logging or error
tracking, no backup/retention policy beyond the 90-day session lifetime.

## Performance and data

| Measurement | Value |
| --- | --- |
| Analysis per song | 7.4 s median, 11.1 s p90 (plus 4.2 s median download) |
| Throughput | 113-song playlist in 6.9 minutes — an effective 3.2 songs at a time, below the 9 configured processes, as decoding contends for the same cores |
| Recommendations end to end | 456–540 ms for 203 earphones (256 posterior draws each) |
| — candidate loading | 164 ms |
| Evaluation suite | ~3 minutes |
| Database | 18 MB |

Current data: 382 tracks, 288 successful analyses, 8 music profiles, 20 sound-profile
versions, 31 anonymous accounts, 203 earphones, 211 measurements, 422 processed
representations, 2 targets, 0 prices.

## Findings and recommendations

| # | Finding | Severity | Recommendation |
| --- | --- | --- | --- |
| 1 | `scripts/dev.py` identified services by process id alone; after a reboot a reused id meant `down` would force-kill an unrelated process (here a Windows `svchost.exe`) | High (fixed) | Fixed: services record their process image and are only acted on when both match; web now runs Next directly instead of the npm launcher, which exits early |
| 2 | No commits and no remote: 360 files exist on one disk | High | Initialise history and push to a private remote; this also runs the existing CI for the first time |
| 3 | The music–preference correlation and answer reliability are unvalidated, and move rankings most | Medium (by design) | Keep it as the stated open question; a listening study or earphone feedback would estimate both |
| 4 | No prices stored, so the budget constraint never applies | Medium | Enter a sourced set through the CSV importer (it refuses unsourced prices) |
| 5 | One measurer, one rig family; redistribution rights assumed, not confirmed | Medium | Keep non-commercial and attributed; confirm before publishing |
| 6 | No rate limiting, CSP, logging or error tracking | Medium (before real users) | Limiter on session creation and submissions, a CSP, structured request logs |
| 7 | Browser tests absent from CI; visualisation untested | Low | Add the Playwright job; test the chart maths |
| 8 | 30-track reference corpus; descriptors remain heuristic | Low (documented) | Grow the corpus; `auralis calibrate` rebuilds from it |
| 9 | ~8 % of analyses fail, almost all "video unavailable" | Low (handled) | No action; failures are recorded and shown honestly |
| 10 | Docker covers only the database; deployment never rehearsed | Low | Rehearse once on a clean machine if the demo is hosted |

Before the demo, in order: version control, then optionally a handful of sourced prices,
then a rehearsal on this machine as it stands.

## Appendix

Versioned artefacts: `analyzer/1`, `descriptors/1` (calibration `corpus-2026-09`),
`music-profile/2`, `sound-profile/3`, `perceptual/1`, `bands/1`, `fr/2`,
`harman-personal/1`.

Commands: `python scripts/dev.py up|down|status|logs`, `auralis worker`,
`auralis import-autoeq`, `auralis import-catalog`, `auralis rebuild-profiles`,
`auralis evaluate`, `auralis calibrate`, `auralis import-fr`.

Further reading in this repository: [architecture.md](architecture.md),
[decisions.md](decisions.md), and the Phase 2 documents
([plan](phase2/plan.md), [research](phase2/research.md),
[methodology](phase2/methodology.md), [evaluation](phase2/evaluation.md)).
