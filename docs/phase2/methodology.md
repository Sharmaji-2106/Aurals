# Auralis methodology (Phase 2)

How Auralis turns a person's music and answers into a personal sound representation,
and how it matches that against measured IEM acoustics. Research background:
[research.md](research.md). Measured results: [evaluation.md](evaluation.md), generated
by `auralis evaluate`.

## The question this answers

> Why does the system believe this recommendation is personalised?

Because the ranking is computed against a **personal target**: the Harman in-ear 2019
target (what most listeners prefer, per Olive et al.) shifted, region by region, by an
estimate of this listener's preference. That estimate comes from what they actually
play (their library's measured spectral balance) and what they told us, combined by an
explicit statistical model whose every assumption is named. The same measured IEM
therefore ranks differently for different listeners, and each ranking is explained by
the computed difference between the IEM's measured response and that listener's
target, per frequency region.

What the system does *not* claim: that it knows anyone's true preference, or that the
link between listening habits and preferred tuning is established. That link is a
stated hypothesis (ρ below) with a sensitivity analysis.

## Provenance categories

Every quantity is one of these, and the API labels them:

| Category | Meaning | Examples |
| --- | --- | --- |
| **measured** | Obtained directly from a signal or an external measurement | band levels, loudness (BS.1770), bandwidth; an IEM's raw frequency response |
| **derived** | Calculated from measured data | a library's band balance vs the reference corpus with bootstrap uncertainty; an IEM's error curve against a target |
| **model_inferred** | Output of a statistical model | posterior preference offsets; predicted preference (Olive et al. model) |
| **heuristic** | Design assumption, not validated | descriptors such as "warmth"; the rumble/punch split; match words |
| **user_provided** | Questionnaire answers | "How much bass do you enjoy?" |
| **literature** | Taken from published research | the Harman target; the preference model's coefficients |

## 1. From music to a representation

Provenance chain: `YouTube link → temporary audio → decoded PCM → features → curation → library representation`.

1. **Measured, per song** (`analysis/features.py`): long-term average spectrum as power
   per octave in nine bands, relative to 500 Hz–2 kHz (level-invariant, so mastering
   loudness cancels out); BS.1770 loudness and EBU loudness range; effective bandwidth
   (to detect lossy uploads); tempo, onsets, percussive share, timbre statistics.
2. **Derived, per song**: each band's deviation from a disclosed reference corpus
   (30 commercially released tracks, 21 genres) in dB, and in corpus-spread units (z).
   The corpus's own spectral decay (4.9 dB/octave as a PSD between 110 Hz and 3.9 kHz)
   matches the ~5 dB/octave Pestana et al. (2013) found across 60 years of hit singles.
3. **Curation**: duplicates count once, atypical recordings are down-weighted (never
   dropped), sonic groups are kept visible. Every song counts once regardless of
   duration. Play counts are not available from links, so repetition cannot be weighted.
4. **Derived, per library** (`music-profile/2`): the weighted median of each band's
   deviation, with its **bootstrap standard error and 90 % interval** (400 resamples of
   songs, seeded by the library's contents). The median resists single extreme
   recordings; the bootstrap turns library size and consistency into a sampling
   uncertainty instead of a hand-made confidence score. Bands where lossy codecs removed
   content from most songs (air, upper treble) are marked, and the model refuses to read
   them as taste.

Descriptors such as warmth or energy remain as labelled heuristics for display; they
do not feed the tonal model (energy is the one exception, labelled heuristic).

**Why not an embedding model?** Pretrained music models (MERT, CLAP) are strong for
tagging and similarity, but nothing links their dimensions to preferred earphone
tuning, and learning such a link needs outcome data Auralis doesn't have. The spectral
representation is interpretable, measured, and in the same units as the IEM data.

## 2. The personal sound model (`sound-profile/3`)

For each dimension *d*, a latent preference θ: dB relative to the Harman target for the
tonal dimensions (sub-bass, mid-bass, warmth, vocal presence, treble, air), population
standard units for energy, treble tolerance and the three priorities.

| Step | Model | Status |
| --- | --- | --- |
| Population prior | θ ~ N(0, σ²); σ_bass 3 dB, σ_treble 2.5 dB (Harman listener classes and demographic effects); σ_mids 1.5 dB, σ_air 2.5 dB | literature-informed / assumption |
| Music | θ \| ẑ ~ N(ρσẑ, σ²(1−ρ²) + ρ²σ²SE²), ẑ = library balance, SE from the bootstrap | derived input, ρ is a hypothesis |
| Answers | y = θ + ε, Var ε = σ²(1−r)/r, r = 0.7 (single-item reliability, Wanous et al. 1997); inferred answers get r/2 | user-provided, assumption |
| Bass answers | anchored in dB on Harman's classes: −3, −2, 0, +2.5, +5 dB | literature-informed |
| Other answers | equal-probability bins of the population distribution | heuristic |
| Posterior | precision-weighted Gaussian combination, closed form | model-inferred |

Consequences, all visible in the API:

- No fixed split between music and answers. With ρ² = r (the default), a large,
  consistent library is exactly as informative as one direct answer; small or
  inconsistent libraries count for less through SE; missing music leaves the prior.
- Music does not speak for treble tolerance or priorities; answers alone do.
- Every value comes with a posterior SD. The UI shows it as a range and as words
  (strong music evidence, refined by your answers, you disagree…), never as a percentage.
- A 0–1 display value is the listener's estimated population percentile, Φ(μ/σ).

**ρ, the central hypothesis.** No study relates a person's library balance to their
preferred tuning. Content matching (ρ > 0) and compensation (ρ < 0; Olive & Welti found
listeners correct individual recordings) are both plausible. Auralis defaults to
content matching, the product's premise, and reports how results change across
ρ ∈ {−0.84, 0, 0.5, 0.84, 0.95}.

## 3. From measurements to an IEM representation

Provenance chain: `oratory1990 PDF → AutoEq numeric CSV (pinned commit) → fr_measurements (raw, checksum, rig) → fr/2 processing → iem_acoustic_profiles`.

1. **Source**: 211 in-ear measurements by oratory1990 on G.R.A.S. IEC 60318-4 ear
   simulators, via AutoEq at a pinned commit, with the original PDF link, rig, licence
   note and measured configuration (e.g. "foam eartips") on every row. Other measurers
   and rig families are not mixed in: a target is only meaningful on the fixture it was
   defined on (IEC 60318-4 for the Harman in-ear target). One measurement failed
   validation (implausible 80 dB range) and was refused.
2. **Validation**: finite, strictly increasing, 100 Hz–10 kHz covered, plausible range.
   Never repaired silently.
3. **Grid**: 1/48 octave, linear in log-frequency, NaN outside the measured range.
4. **Normalisation**: 0 dB at 500 Hz (1/3-octave mean), the Harman convention.
5. **Error curve**: measurement minus target (Harman in-ear 2019, stored with its own
   provenance).
6. **Features**: 1/6-octave smoothed band errors with rig-validity weights (IEC 60318-4
   is specified to 10 kHz), and the Olive et al. in-ear statistics on the ISO R40 grid:
   SD and slope (on ln f) of the error over 20 Hz–10 kHz, mean absolute error over
   40 Hz–10 kHz aligned at 500 Hz, and the predicted preference
   `100.0795 − 8.5·SD − 6.796·|slope| − 3.475·AAE`.

**Validation of the implementation**: for all 203 matched IEMs, Auralis's statistics
equal AutoEq's independently published values (score r = 0.9998, mean absolute
difference 0.24 points, which is AutoEq's integer rounding; SD, slope and AAE within
0.01).

**Structure of the data (PCA)**: across the 203 error curves, one bass-shelf component
explains 55 % of the variance and a broad tilt another 16 %; five components explain
90 %. This supports representing preference as a small number of smooth regional
offsets, as the Harman research suggests, rather than learning a high-dimensional
representation.

## 4. Matching (`harman-personal/1`)

1. Personal target = Harman in-ear 2019 + the posterior offsets, interpolated in
   log-frequency between band centres.
2. For 256 seeded draws from the posterior (sampled per dimension so linked bands move
   together), compute the Olive model against each drawn target; rank by the expected
   rating and report its 10–90 % range. With no evidence, this reproduces the published
   ranking closely (Kendall τ = 0.96).
3. Constraints: same rig family as the target; budget only when the price is known and
   in the listener's currency (otherwise flagged, never silently dropped).
4. Explanations: for bass, lower mids, vocals/presence and treble, the mean error
   against the listener's target and the width of their 80 % range there; "within" or
   "above/below", with the numbers and what that part of the target rests on. Air is
   reported as unreliable. An audit re-derives every quantitative reason from the raw
   curves: 100 % consistent.

The recommender is a `Protocol`; `band-rms/1` (reliability-weighted RMS band error)
implements the same contract for comparison. The two agree on only about half of the
top-10 (Jaccard 0.43–0.54), which is why the validated model is the default.

## 5. Evaluation summary

From [evaluation.md](evaluation.md):

- **Representation**: 90 % interval of the sub-bass balance narrows from ~20 dB at 5
  songs to ~3 dB at 80; a 106-song library reproduces its balance shape across random
  halves (r = 0.98). Bass-forward versus acoustic genres (external labels) differ by
  22.6 dB in sub-bass (permutation p = 0.007), and their music-only targets by 4.3 dB.
- **Behaviour**: moving a listener's bass or treble target by known amounts moves the
  top-10's measured bass/treble monotonically (Spearman 1.0 and 0.99).
- **Ablation**: adding a listener's music to their answers replaces 3–4 of their top
  10 (Jaccard overlap 0.43–0.54); music alone replaces 1–2 of the reference top 10.
  This shows the music contributes information to the ranking; whether it makes the
  ranking better needs outcome data.
- **Assumptions**: the prior widths barely matter (top-10 overlap ≥ 0.83 on average);
  the answer reliability and ρ matter most (0.60–0.75). Those two are exactly what a
  listening study should estimate.

## 6. What ML is and isn't justified now (2G)

| Candidate | Verdict | Why |
| --- | --- | --- |
| Supervised recommender | No | No user–IEM outcomes to train or validate on |
| Music embeddings for matching | No | No link to FR preference; would be uninterpretable |
| PCA of IEM curves | Yes, as analysis | Answers a real question (dimensionality); supports the target-shift model |
| Bayesian preference model | Yes (in use) | Principled uncertainty with few, named parameters |
| Next: estimate ρ and r | Yes, with data | Feedback on real IEMs is already a supported input (`FeedbackSignal`) |
| Next: adaptive questioning | Yes, later | The posterior gives each question's expected information gain |
| Next: embeddings for library description | Maybe | Grouping and describing music, not matching |

## 7. Limitations

- The reference corpus is small (30 tracks) and hand-picked, though its spectral slope
  agrees with the literature.
- ρ is untested, and r is borrowed from another field.
- The Olive model was fitted to average listeners against the Harman target; applying
  it to personal targets is an extension.
- One measurer and one rig family; no prices yet (the importer requires a source and
  date for each, and none were verifiable in this phase).
- Libraries come from links, so repeated listening can't be weighted.
