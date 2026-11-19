# Phase 2 — audit and implementation plan

Written 2026-09-18, before any Phase 2 code changes. The research that motivates the
plan is summarised in [research.md](research.md).

## 1. Audit of Phase 1 / 1.5

### What is already technically valid (keep)

| Component | Why it holds up |
| --- | --- |
| Decoding, resampling, BS.1770 loudness, EBU loudness range | Standard algorithms, tested with synthetic signals. |
| Long-term average spectrum (LTAS) per band, relative to 500 Hz–2 kHz | Level-invariant spectral balance; the same quantity studied at scale by Pestana et al. (2013). |
| Effective bandwidth per track, band coverage | Directly addresses lossy uploads that remove the top octave. |
| Curation: duplicates count once, outliers down-weighted, clusters kept | Robust statistics; no silent deletion. |
| Weighted quantiles for library summaries | Robust to single extreme tracks. |
| FR import with raw points, checksum and source; NaN outside the measured range | Provenance and "unknown stays unknown" are already structural. |
| Versioned, immutable profiles; upgrade by rebuild | Old results stay interpretable. |

### What is heuristic (label, isolate, and where possible replace)

| Component | Status |
| --- | --- |
| Descriptors (warmth, brightness, energy, density, width, dynamics) | Logistic of robust z against a 30-track corpus. Useful summaries, not perceptual models. |
| Band "emphasis" (0–1) | Same construction; it hides the underlying dB deviation. |
| `sound-profile/2` fusion | Music strength = heuristic confidence; answer "room" = 1 − strength; dB spans per band (`CURVE_SPAN_DB`) chosen by hand. |
| Answer → value mappings | Hand-picked levels per option. |
| `baseline/1` recommender | Weighted RMS against an undefined reference target (`auralis-neutral/1`). |
| FR band reliability weights | Hand-set; partly supported by the IEC 60318-4 validity range. |

### What is oversimplified

- The music profile is expressed in unitless 0–1 scores, while matching needs dB
  relative to a defined target. The link between the two was a hand-set span.
- There is no reference target, so preference offsets had no physical anchor.
- Library uncertainty is a heuristic confidence rather than a sampling estimate.
- The recommender ignores published evidence on what predicts headphone preference.
- Music is assumed to indicate preference in one direction (more bass in the library
  means more bass wanted) without acknowledging that the literature does not settle this.

### What needs better normalisation

- FR curves: the Harman methodology normalises at 500 Hz and compares against a target
  defined on a specific coupler (GRAS RA0045, IEC 60318-4). Comparisons across rig
  families must be refused, not silently mixed.
- Music: deviations should be expressed in dB relative to a disclosed reference corpus,
  with their spread, instead of only as logistic scores.

### What needs research support

- The target and the dimensions along which preference varies (answered: Harman).
- How to score an IEM against a target (answered: Olive et al. in-ear model).
- Whether library content predicts preferred tuning (not answered by the literature;
  becomes an explicit, testable hypothesis).
- How reliable a single questionnaire answer is (single-item reliability literature).

### What should remain unchanged

The audio pipeline, curation, the database layout for tracks and analyses, the API
style, the frozen UI, and the Phase 1.5 product structure: music anchors, answers
refine, evidence in words.

## 2. Decisions taken from the research

1. **Reference target: Harman in-ear 2019** (Olive et al.), with its bass shelf. Preference
   offsets and IEM features are expressed relative to it. It is rig-specific (IEC 60318-4).
2. **Scoring: the Olive et al. in-ear predicted-preference model** (standard deviation,
   absolute slope and mean absolute error of the error curve, 20 Hz–10 kHz), used as
   published against the population target and, as a labelled extension, against the
   listener's personal target.
3. **Personalisation as a target shift**, not a free-form curve: the Harman research found
   individual variation mainly in bass (and treble) level. The personal target is the
   reference plus per-region offsets with population priors.
4. **Uncertainty-aware Bayesian fusion** in dB: a population prior, the music as a
   conditional prior (hypothesis correlation ρ), answers as noisy observations with
   literature-informed reliability. No fixed source weights; every assumption is a named
   parameter with a status, and the evaluation reports sensitivity to it.
5. **No supervised recommender and no embedding model now.** There are no labelled
   user–IEM outcomes to train on, and a pretrained music embedding has no validated link
   to FR preference. Unsupervised analysis (PCA of IEM error curves) is used where it
   answers a real question: how many dimensions IEM tunings actually vary along.

## 3. Plan (each step leaves the app runnable)

| Step | Scope | Output |
| --- | --- | --- |
| 2A | Audit and research | This plan, [research.md](research.md) |
| 2B | Music representation | Per-band dB deviation from the reference corpus with bootstrap uncertainty (`music-profile/2`); rebuild command |
| 2C | IEM dataset | Schema for targets, rig family and catalogue metadata; FR processing `fr/2` (500 Hz normalisation, Olive statistics); importer for AutoEq-format data at a pinned commit (oratory1990 in-ear, Harman targets), kept out of the repo |
| 2D | Personal profile | `sound-profile/3`: Bayesian fusion in dB relative to the reference target, same API shape for the frozen UI, plus an assumptions/provenance block |
| 2E | Recommendation | `harman-personal/1`: personal target, Olive model, posterior sampling for uncertainty, budget and rig constraints, reasons from computed region errors; `band-rms/1` kept for comparison |
| 2F | Evaluation | `auralis evaluate`: representation reliability, implementation check against AutoEq's published scores, sensitivity, ablation (music / answers / both), assumption sensitivity, explanation audit |
| 2G | ML check | PCA of IEM error curves; decision on whether a learned component is justified |
| UI | Minimal | Replace the "coming next" placeholder with real matches and their reasons |

## 4. Provenance categories used everywhere

`measured` (external measurement or direct signal measurement), `derived` (computed
from measured data), `model_inferred` (output of a statistical model), `heuristic`
(design assumption, not validated), `user_provided` (questionnaire answers).

## 5. Status (2026-09-19)

All steps are implemented and the app stays runnable throughout:

| Step | Delivered |
| --- | --- |
| 2A | This plan; [research.md](research.md) |
| 2B | `music-profile/2`: band balance in dB and z vs the reference corpus, bootstrap SE and 90 % intervals, codec coverage; `auralis rebuild-profiles` |
| 2C | `fr_targets`, rig families, measurement provenance and variants; `fr/2`; 211 oratory1990 in-ear measurements + Harman targets via `auralis import-autoeq`; sourced catalogue import |
| 2D | `sound-profile/3`, assumptions module with statuses |
| 2E | `harman-personal/1`, `band-rms/1`, `GET /api/recommendations`, matches on the profile page |
| 2F | `auralis evaluate` → [evaluation.md](evaluation.md) |
| 2G | PCA and the ML decision in [methodology.md](methodology.md) section 6 |

