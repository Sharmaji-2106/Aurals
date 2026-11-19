# Phase 2 — research summary

What the literature supports, what it does not, and what Auralis adopts as a result.
Each claim below carries its source. Where no source exists, the claim is marked as an
Auralis hypothesis or assumption.

## 1. What listeners prefer in headphones and IEMs

**A population target exists.** In controlled, double-blind "virtual headphone" tests,
listeners across ages, experience levels and four countries largely agreed; the
headphone equalised to the Harman target was preferred on average over commercial
models (Olive, Welti & McMullin 2013, 2014; Olive, Welti & Khonsaripour 2018; review in
Olive 2022). The in-ear target is close to the over-ear one with about 4 dB more bass
(Olive 2022). The in-ear target was developed on a G.R.A.S. RA0045 coupler compliant
with IEC 60318-4 (Listen Inc. application note on the Harman in-ear model).

**Preference can be predicted from the error curve.** For in-ear headphones, a linear
model of the error curve (measurement minus target, both normalised at 500 Hz) predicts
listeners' ratings with r = 0.91 (Olive, Welti & Khonsaripour 2017; Olive 2022). The
implementation used by AutoEq is
`100.0795 − 8.5·SD − 6.796·|slope| − 3.475·AAE`, with SD and slope (regression on ln f)
over 20 Hz–10 kHz and mean absolute error over 40 Hz–10 kHz after aligning at 500 Hz.

**Individual variation is mostly bass (and treble) level.** Hierarchical clustering of
preferences found three classes: 64 % prefer the Harman target, 15 % prefer it with
4–6 dB more bass, 21 % with about 2 dB less bass; the preferred bass level is the main
feature that defines class membership (Olive 2022, summarising Olive et al. 2018).
Adjustment experiments with 249 listeners showed preferred bass and treble depend on
programme, age, gender and experience; for example, female listeners preferred about
1 dB less bass and 2 dB less treble than male listeners (Olive & Welti 2015). The
authors conclude that a single target plus simple bass and treble adjustment is a
practical route to personalisation.

**Programme material changes preferred bass and treble,** which Olive attributes to
variation in recordings: listeners adjust playback to restore balance on recordings with
too much or too little bass (Olive & Welti 2015; Toole's "circle of confusion"). This is
per-recording compensation *within* a listener. It is not evidence about whether people
who habitually listen to bass-heavy music prefer bass-heavy earphones.

**Measurement limits.** IEC 60318-4 ear simulators are specified for insert earphones
from 100 Hz to 10 kHz; an undamped half-wave resonance near 13.5 kHz limits their use
above roughly 10 kHz (IEC 60318-4:2010; G.R.A.S. RA0045 documentation). Targets are
rig-specific: the Harman targets "may not correlate" when used with other fixtures
(Listen Inc. note).

## 2. From music to a representation

**Long-term average spectrum is a valid and discriminative description of recordings.**
Pestana et al. (2013) analysed number-one singles 1950–2010: spectra trend towards a
roughly linear decay of about 5 dB per octave between 100 Hz and 4 kHz, with clear
genre differences in low-end response and brightness. Hove, Vuust & Stupacher (2019)
report rising bass levels in popular recordings (1955–2016), related to loudness. Both
support representing a library by its spectral balance relative to typical commercial
music, and both warn that era and mastering practice shift that balance.

**Perceptual descriptors.** Brightness is linked to spectral centroid in controlled
studies (Schubert & Wolfe 2006; McAdams et al. 1995), but such links are established for
isolated tones and timbre spaces, not for whole mixes played through earphones.
Auralis's descriptors therefore stay labelled heuristics and are not used for matching.

**Pretrained embeddings.** Self-supervised music models (MERT, CLAP, MAP family) are
strong general representations for tagging, genre and similarity tasks (MARBLE benchmark,
Yuan et al. 2023). None has a demonstrated relationship with preferred headphone tuning,
and using one would require labelled outcomes Auralis does not have. They are a
candidate for grouping and describing libraries later, not for matching now.

**Programme-dependent audibility.** The audibility of spectral deviations (resonances)
depends on programme material (Toole & Olive 1988). This supports using a listener's
music to judge which frequency regions matter to them, a role for music that does not
depend on the unproven preference hypothesis.

## 3. From music to preference: the open question

No study found connects the spectral balance of a person's own library with the
earphone tuning they prefer. Two opposite mechanisms are plausible:

- **Content matching**: people choose music whose balance they enjoy, so their preferred
  playback leans the same way.
- **Compensation**: listeners correct recordings towards a balanced norm (the effect
  Olive observed per recording), which would lean the other way.

Auralis's product premise, that listening behaviour carries information about sound
preference, is therefore a **hypothesis**. The model makes it explicit as a single
correlation parameter ρ between library balance and preferred balance, defaults to the
content-matching direction, and the evaluation reports how results change across
ρ ∈ [−1, 1]. Listener feedback (Phase 3) can estimate ρ.

## 4. Self-reports

A single questionnaire item is a noisy measure. Meta-analytic evidence puts the
reliability of single-item measures at roughly 0.7 as a conservative minimum (Wanous,
Reichers & Hudy 1997). Auralis models each answer as an observation of the latent
preference with that reliability. This is borrowed from a different domain (job
satisfaction), so it is an informed assumption rather than a measured property of
audio preference questions.

## 5. Recommendation and explanation

Content-based matching against measured responses is the only defensible option
without interaction data. Explanations must be generated from the quantities that
produced the ranking (the error curve by region), not written first and justified
afterwards (transparency and scrutability criteria, Tintarev & Masthoff 2015).
Evaluation without outcome data relies on reliability, sensitivity and ablation
analyses; validity against real preferences needs a listening study (Section 6).

## 6. What would validate the system

A study in the Harman style: listeners hear candidate IEM responses simulated over one
reference IEM (virtual headphone method, Olive et al. 2013b), rate them blind, and the
ratings are compared with Auralis's personal predictions versus the population
prediction. The same data would estimate ρ and the answer reliability.

## Adopted principles

| Principle | Basis | Status in Auralis |
| --- | --- | --- |
| Reference target = Harman in-ear 2019 on IEC 60318-4 | Olive et al. | literature |
| Normalise at 500 Hz; error = measurement − target | Olive et al.; Listen Inc. | literature |
| Score with the in-ear preference model | Olive et al. 2017 (r = 0.91) | literature (model_inferred output) |
| Same model against a personal target | extension | heuristic |
| Personalisation as regional offsets, bass variance largest | Olive & Welti 2015; Olive et al. 2018 | literature-informed priors |
| Library represented as dB deviation from a reference corpus, with bootstrap uncertainty | Pestana et al. 2013; standard statistics | derived |
| Library balance predicts preferred balance (ρ > 0) | none | hypothesis, tested by sensitivity |
| Answer reliability 0.7 | Wanous et al. 1997 | assumption from a neighbouring field |
| Compare only within one rig family, ≤ 10 kHz weighted fully | IEC 60318-4 | literature |
| No supervised or embedding model yet | no outcome data | decision, revisit with data |

## References

- Hove, M. J., Vuust, P., & Stupacher, J. (2019). Increased levels of bass in popular music recordings 1955–2016 and their relation to loudness. *JASA* 145(4), 2247. https://pubs.aip.org/asa/jasa/article-abstract/145/4/2247/844380
- IEC 60318-4:2010. Occluded-ear simulator for insert earphones. https://webstore.iec.ch/en/publication/1445
- Listen Inc. Harman predictive model for in-ear headphones (application note). https://www.listeninc.com/wp/media/seq_note_Harman_Predictive_Model_In_Ear_Headphones_v2-1.pdf
- McAdams, S., et al. (1995). Perceptual scaling of synthesized musical timbres. *Psychological Research* 58, 177–192.
- Olive, S. E. (2022). The perception and measurement of headphone sound quality: what do listeners prefer? *Acoustics Today* 18(1), 58–67. https://doi.org/10.1121/AT.2022.18.1.58
- Olive, S. E., & Welti, T. (2015). Factors that influence listeners' preferred bass and treble levels in headphones. AES 139th Convention. https://www.aes.org/e-lib/online/browse.cfm?elib=17940
- Olive, S. E., Welti, T., & Khonsaripour, O. (2017). A statistical model that predicts listeners' preference ratings of in-ear headphones, Parts 1 and 2. AES 143rd Convention. https://secure.aes.org/forum/pubs/conventions/?elib=19237
- Olive, S. E., Welti, T., & Khonsaripour, O. (2018). A statistical model that predicts listeners' preference ratings of around-ear and on-ear headphones. AES 144th Convention. https://secure.aes.org/forum/pubs/conventions/?elib=19436
- Olive, S. E., Welti, T., & McMullin, E. (2013). Listener preference for different headphone target response curves; A virtual headphone listening test methodology. AES 134th Convention; AES 51st Conference.
- Pasanen, J. AutoEq (MIT licence): Harman targets and preference-score implementation. https://github.com/jaakkopasanen/AutoEq
- Pestana, P. D., Ma, Z., Reiss, J. D., Barbosa, A., & Black, D. A. A. (2013). Spectral characteristics of popular commercial recordings 1950–2010. AES 135th Convention. https://www.researchgate.net/publication/274511175
- Schubert, E., & Wolfe, J. (2006). Does timbral brightness scale with frequency and spectral centroid? *Acta Acustica united with Acustica* 92, 820–825.
- Tintarev, N., & Masthoff, J. (2015). Explaining recommendations: design and evaluation. In *Recommender Systems Handbook*, Springer.
- Toole, F. E., & Olive, S. E. (1988). The modification of timbre by resonances: perception and measurement. *JAES* 36, 122–142. https://www.aes.org/e-lib/browse.cfm?elib=5163
- Wanous, J. P., Reichers, A. E., & Hudy, M. J. (1997). Overall job satisfaction: how good are single-item measures? *Journal of Applied Psychology* 82(2), 247–252. https://doi.org/10.1037/0021-9010.82.2.247
- Yuan, R., et al. (2023). MARBLE: Music Audio Representation Benchmark for Universal Evaluation. NeurIPS Datasets and Benchmarks. https://arxiv.org/abs/2306.10548
