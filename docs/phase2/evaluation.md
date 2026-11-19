# Phase 2 evaluation

Generated 2026-09-18T20:59:36+00:00 by `auralis evaluate` with `sound-profile/3`. Data: 203 measured IEMs, 288 analysed recordings, 3 listener libraries (anonymised).

What this can and cannot show: without outcome data (which listeners liked which earphones) nothing here measures whether recommendations are *right*. It measures whether the pipeline is correct, stable, responsive and honest, and how much each assumption matters. See `research.md` section 6 for the study that would.

## 1. Implementation check against published scores

Auralis's Olive et al. in-ear statistics for 203 IEMs, compared with the values AutoEq publishes for the same measurements (AutoEq results/RANKING.md at the pinned commit (scores rounded to integers)):

| score r | score MAE | SD MAE (dB) | slope MAE | AAE MAE (dB) |
|---|---|---|---|---|
| 0.9998 | 0.238 | 0.003 | 0.003 | 0.002 |

Differences in the score are rounding in the published table.

## 2. Music representation

### Reference corpus

The corpus's spectral decay between 110 Hz and 3.9 kHz is -1.9 dB/octave relative to pink noise, i.e. -4.9 dB/octave as a power spectral density. Pestana et al. (2013): roughly linear decay of about 5 dB/octave between 100 Hz and 4 kHz in number-one singles, 1950-2010.

### Sampling uncertainty by library size

Median width of the 90 % bootstrap interval of the library balance (dB), random libraries drawn from all analysed recordings:

| songs | sub_bass | mid_bass | lower_mids | upper_mids | presence | lower_treble | air |
|---|---|---|---|---|---|---|---|
| 5 | 20.02 | 7.21 | 5.04 | 4.24 | 7.04 | 8.48 | 12.58 |
| 10 | 8.38 | 3.54 | 2.45 | 2.24 | 3.78 | 2.58 | 5.85 |
| 20 | 6.3 | 2.05 | 1.98 | 1.64 | 2.3 | 2.42 | 4.52 |
| 40 | 4.32 | 2.18 | 1.19 | 1.39 | 2.25 | 2.23 | 3.37 |
| 80 | 2.88 | 1.41 | 1.02 | 0.83 | 1.51 | 1.73 | 2.38 |

### Split-half reliability

Correlation of the band-balance shape between random halves of one library, its Spearman–Brown correction to the full library (undefined when the halves don't agree on a shape), and the sampling noise of the full-library balance per band:

| library | songs | half r | reliability | sub-bass SD (dB) | presence SD (dB) | treble SD (dB) |
|---|---|---|---|---|---|---|
| Library A | 106 | 0.976 | 0.988 | 0.52 | 0.4 | 0.48 |
| Library B | 20 | -0.579 | — | 3.04 | 1.12 | 1.4 |
| Library C | 10 | -0.714 | — | 5.6 | 1.29 | 3.16 |

A library close to typical music has little shape for its halves to agree on, and complementary halves deviate from the whole in opposite directions, so such libraries show negative correlations. That means "near the reference", not "unstable"; the per-band noise is the stability measure the model uses (it enters as the standard error of the library balance).

### Does it separate kinds of music?

Reference-corpus recordings grouped by their (external) genre labels: bass-forward genres (8 songs) versus acoustic genres (9). Median sub-bass deviation +4.9 vs -17.6 dB (difference +22.6 dB, permutation p = 0.0065); air +8.3 vs -3.6 dB. Music-only sub-bass targets: +0.91 vs -3.37 dB.

## 3. Recommendation behaviour

### Sensitivity: bass

The listener's bass target is moved by known amounts; the table shows the mean measured bass level (vs the reference) of the top 10. Spearman ρ = 1.0, monotonic: yes.

| target shift (dB) | top-10 mean level (dB) | top 3 |
|---|---|---|
| -4.0 | -1.71 | Moondrop Blessing, Moondrop Blessing 2, Moondrop Chu |
| -2.0 | -1.44 | Moondrop Chu, Moondrop Quarks DSP, Moondrop Blessing |
| 0.0 | -0.48 | Truthear Nova, AKG N400, Moondrop Quarks DSP |
| 2.0 | 1.5 | Truthear Nova, Moondrop Variations, Samsung Galaxy Buds2 Pro |
| 4.0 | 3.09 | Sony MH755, Sony MH750, Moondrop Variations |
| 6.0 | 4.21 | Anker Soundcore Liberty Air 2, Sony MH755, JBL Free X |

### Sensitivity: treble

The listener's treble target is moved by known amounts; the table shows the mean measured treble level (vs the reference) of the top 10. Spearman ρ = 0.986, monotonic: yes.

| target shift (dB) | top-10 mean level (dB) | top 3 |
|---|---|---|
| -4.0 | -2.71 | Samsung Galaxy Buds2 Pro, Moondrop Starfield, Truthear Gate |
| -2.0 | -1.12 | Samsung Galaxy Buds2 Pro, 7Hz Salnotes Zero, Truthear Gate |
| 0.0 | -0.86 | Truthear Nova, AKG N400, Moondrop Quarks DSP |
| 2.0 | 0.27 | Truthear Nova, Moondrop Quarks DSP, AKG N400 |
| 4.0 | 0.9 | Truthear x Crinacle Zero, Truthear Nova, Moondrop Quarks DSP |
| 6.0 | 0.9 | Truthear x Crinacle Zero, Truthear Nova, Jabra Elite 7 Pro |

### Consistency with the published model

With no evidence, Auralis ranks by expected rating over the population's spread; the published model ranks by the rating at the reference target. Kendall τ between the two rankings: 0.957; top-10 overlap 0.82.

Top-10 overlap between the Olive-model ranking and a simpler band-RMS ranking on the same profiles: 0.54, 0.43, 0.54.

## 4. Ablation: music, answers, both

Top-10 overlap (Jaccard) between rankings. 1.0 = the source changed nothing.

| library | songs | music vs reference | answers vs reference | combined vs answers | combined vs music | sub-bass target (music / answers / combined, dB) |
|---|---|---|---|---|---|---|
| Library A | 106 | 0.67 | 0.43 | 0.54 | 0.67 | -0.9 / +1.1 / +0.1 |
| Library B | 20 | 0.82 | 0.0 | 0.43 | 0.11 | +0.1 / +4.2 / +2.7 |
| Library C | 10 | 0.82 | — | — | — | +0.1 |

## 5. Sensitivity to assumptions

One assumption changed at a time; mean and worst top-10 overlap with the default ranking across the libraries.

| assumption | status | value | mean overlap | worst overlap |
|---|---|---|---|---|
| prior_sd_bass_db | literature_informed | 2.0 | 0.94 | 0.82 |
| prior_sd_bass_db | literature_informed | 4.0 | 1.0 | 1.0 |
| prior_sd_treble_db | literature_informed | 1.5 | 0.83 | 0.67 |
| prior_sd_treble_db | literature_informed | 3.5 | 0.88 | 0.82 |
| prior_sd_mids_db | assumption | 1.0 | 0.94 | 0.82 |
| prior_sd_mids_db | assumption | 2.5 | 0.88 | 0.82 |
| prior_sd_air_db | assumption | 1.5 | 0.94 | 0.82 |
| prior_sd_air_db | assumption | 3.5 | 1.0 | 1.0 |
| answer_reliability | literature_informed | 0.5 | 0.72 | 0.33 |
| answer_reliability | literature_informed | 0.9 | 0.6 | 0.25 |
| indirect_reliability_factor | assumption | 0.25 | 1.0 | 1.0 |
| indirect_reliability_factor | assumption | 0.75 | 0.94 | 0.82 |
| music_correlation | hypothesis | -0.837 | 0.72 | 0.54 |
| music_correlation | hypothesis | 0.0 | 0.6 | 0.43 |
| music_correlation | hypothesis | 0.5 | 0.69 | 0.54 |
| music_correlation | hypothesis | 0.95 | 0.75 | 0.43 |

## 6. Explanation audit

60 recommendations, 170 quantitative reasons re-derived from the raw curves: 170 consistent (100.0 %).

## 7. Structure of measured tunings (PCA)

Principal components of 203 error curves (measurement minus reference, 20 Hz–10 kHz):

| component | variance | cumulative | shape | r(bass shelf) | r(tilt) |
|---|---|---|---|---|---|
| 1 | 0.545 | 0.545 | bass shelf | 0.81 | -0.49 |
| 2 | 0.161 | 0.706 | broad tilt | -0.74 | 0.91 |
| 3 | 0.09 | 0.796 | localised, peaking near 6.0 kHz | -0.21 | 0.29 |
| 4 | 0.073 | 0.868 | localised, peaking near 10.0 kHz | -0.01 | 0.15 |
| 5 | 0.036 | 0.904 | localised, peaking near 1.8 kHz | -0.35 | 0.11 |

