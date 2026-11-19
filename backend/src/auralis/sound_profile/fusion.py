"""Personal sound profile (``sound-profile/3``): a Bayesian model in dB.

What is estimated: for each preference dimension, the listener's preferred deviation
from a population reference. For the tonal dimensions that reference is the Harman
in-ear 2019 target (Olive et al.), and the unit is dB; for character, tolerance and
priorities it is the population median, in standard-deviation units.

How (Gaussian, closed form, per dimension):

1. **Population prior** ``θ ~ N(0, σ²)``. σ comes from Harman's preference research
   where it exists (bass, treble) and is a labelled assumption elsewhere.
2. **Music** (behavioural evidence, derived from measured audio). The library's balance
   ``ẑ`` (median deviation from the reference corpus, in corpus-spread units, with a
   bootstrap standard error) shifts the prior under a bivariate-normal model with
   correlation ρ between library balance and preferred balance::

       θ | music ~ N(ρσẑ, σ²(1 − ρ²) + ρ²σ²·SE²)

   ρ is the single, explicit hypothesis linking listening to preference (see
   :mod:`auralis.sound_profile.assumptions`); small or inconsistent libraries count
   for less through SE.
3. **Answers** (user-provided). Each answer is mapped to a value in the dimension's unit
   and treated as an observation ``y = θ + ε`` with ``Var ε = σ²(1 − r)/r``, where r is
   the reliability of a single self-report item; inferred answers get less.
4. **Posterior**: precision-weighted combination of 2 and 3. Nothing is fixed about the
   balance between music and answers; it follows from ρ, r and the evidence.

Outputs keep the Phase 1.5 shape: a 0-1 ``value`` per dimension, now the listener's
estimated percentile in the population (Φ(μ/σ)); a preference curve in dB relative to
the reference target with an 80 % credible range; the same curve from each source
alone; and, in words, what each value rests on.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from statistics import NormalDist
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict, Field

from auralis.acoustics.bands import BANDS, BandKey
from auralis.analysis.aggregate import MusicProfileData
from auralis.sound_profile.assumptions import DEFAULT, AssumptionOut, ModelParameters

MODEL_VERSION: Final = "sound-profile/3"
REFERENCE_TARGET: Final = "harman-ie-2019"

DimensionKey = Literal[
    "sub_bass",
    "mid_bass",
    "warmth",
    "vocal_presence",
    "treble",
    "air",
    "energy",
    "treble_tolerance",
    "detail",
    "soundstage",
    "naturalness",
]
Group = Literal["tonal", "character", "tolerance", "priority"]
Source = Literal["prior", "music", "questionnaire", "feedback", "listening", "genre"]
Provenance = Literal[
    "measured", "derived", "model_inferred", "heuristic", "user_provided", "literature"
]
MusicSupport = Literal["strong", "moderate", "limited", "none"]
AnswerSupport = Literal["direct", "indirect", "none"]
Agreement = Literal["agree", "refine", "differ"]

MUSIC_STRONG: Final = 0.6  # share of population variance the music explains
MUSIC_MODERATE: Final = 0.35
CREDIBLE_Z: Final = 1.2816  # 80 % central credible interval
_NORMAL: Final = NormalDist()


@dataclass(frozen=True, slots=True)
class DimensionSpec:
    label: str
    group: Group
    description: str
    low: str
    high: str
    unit: Literal["dB", "sd"]
    scale: Callable[[ModelParameters], float]


def _unit_scale(_: ModelParameters) -> float:
    return 1.0


DIMENSIONS: Final[dict[DimensionKey, DimensionSpec]] = {
    "sub_bass": DimensionSpec(
        "Sub-bass",
        "tonal",
        "The deep rumble below the bass line.",
        "Restrained",
        "Elevated",
        "dB",
        lambda p: p.sd_bass_db,
    ),
    "mid_bass": DimensionSpec(
        "Mid-bass",
        "tonal",
        "Punch and body of kick drums and bass guitar.",
        "Lean",
        "Punchy",
        "dB",
        lambda p: p.sd_bass_db,
    ),
    "warmth": DimensionSpec(
        "Warmth",
        "tonal",
        "Fullness in the lower midrange.",
        "Clean",
        "Warm",
        "dB",
        lambda p: p.sd_mids_db,
    ),
    "vocal_presence": DimensionSpec(
        "Vocal presence",
        "tonal",
        "How far forward voices and lead instruments sit.",
        "Laid-back",
        "Forward",
        "dB",
        lambda p: p.sd_mids_db,
    ),
    "treble": DimensionSpec(
        "Treble",
        "tonal",
        "Crispness of cymbals and consonants.",
        "Smooth",
        "Crisp",
        "dB",
        lambda p: p.sd_treble_db,
    ),
    "air": DimensionSpec(
        "Air",
        "tonal",
        "The open shimmer at the very top.",
        "Soft",
        "Airy",
        "dB",
        lambda p: p.sd_air_db,
    ),
    "energy": DimensionSpec(
        "Energy",
        "character",
        "Overall liveliness of the presentation.",
        "Relaxed",
        "Energetic",
        "sd",
        _unit_scale,
    ),
    "treble_tolerance": DimensionSpec(
        "Treble tolerance",
        "tolerance",
        "How well you handle bright or sharp sound.",
        "Sensitive",
        "Tolerant",
        "sd",
        _unit_scale,
    ),
    "detail": DimensionSpec(
        "Detail",
        "priority",
        "How much resolving fine detail matters.",
        "Low priority",
        "High priority",
        "sd",
        _unit_scale,
    ),
    "soundstage": DimensionSpec(
        "Soundstage",
        "priority",
        "How much a spacious presentation matters.",
        "Low priority",
        "High priority",
        "sd",
        _unit_scale,
    ),
    "naturalness": DimensionSpec(
        "Naturalness",
        "priority",
        "How much true-to-life timbre matters.",
        "Low priority",
        "High priority",
        "sd",
        _unit_scale,
    ),
}

# Stored profiles predate some fields, so they have defaults; responses always carry them.
OUTPUT: Final = ConfigDict(json_schema_serialization_defaults_required=True)


class Evidence(BaseModel):
    source: Source
    value: float = Field(ge=0, le=1, description="What this source alone points to (0-1)")
    weight: float = Field(
        ge=0,
        description="This source's share of the posterior precision. Follows from the "
        "model; not a measure of accuracy.",
    )
    note: str
    status: Provenance = "derived"


class Basis(BaseModel):
    """What a value rests on, in words rather than numbers."""

    model_config = OUTPUT

    music: MusicSupport
    answers: AnswerSupport
    agreement: Agreement | None = Field(
        default=None, description="How the answers relate to the music, when both are present"
    )


class Dimension(BaseModel):
    model_config = OUTPUT

    key: DimensionKey
    label: str
    group: Group
    description: str
    low_label: str
    high_label: str
    value: float = Field(ge=0, le=1, description="Estimated population percentile, Φ(μ/σ)")
    confidence: float = Field(
        ge=0, le=1, description="Share of population variance resolved (internal; not shown)"
    )
    unit: Literal["dB", "sd"] = "sd"
    mean: float = Field(default=0, description="Posterior mean in the dimension's unit")
    sd: float = Field(default=1, description="Posterior standard deviation, same unit")
    measurable_from_music: bool = False
    music_value: float | None = Field(default=None, description="What the music alone suggests")
    answer_value: float | None = Field(default=None, description="What the answers alone suggest")
    basis: Basis = Basis(music="none", answers="none")
    evidence: list[Evidence]


class CurvePoint(BaseModel):
    model_config = OUTPUT

    band: BandKey
    label: str
    center_hz: float
    offset_db: float = Field(description="Posterior mean offset from the reference target")
    confidence: float
    sd_db: float = Field(default=0, description="Posterior standard deviation (dB)")
    low_db: float = Field(default=0, description="Lower edge of the range the evidence allows")
    high_db: float = Field(default=0, description="Upper edge of the range the evidence allows")
    reference: bool = Field(default=False, description="The fixed reference band")
    basis: Basis = Basis(music="none", answers="none")


class CurveLayers(BaseModel):
    """The same curve from each source alone, so the combination can be seen."""

    model_config = OUTPUT

    music: list[CurvePoint] | None = None
    answers: list[CurvePoint] | None = None


class FeedbackSignal(BaseModel):
    """A listener's reaction to a specific earphone (future input)."""

    dimension: DimensionKey
    direction: Literal[-1, 1] = Field(description="+1 = wanted more, -1 = wanted less")
    note: str = ""


class SoundProfileData(BaseModel):
    model_config = OUTPUT

    model_version: str = MODEL_VERSION
    basis: Literal["heuristic", "bayesian"] = "bayesian"
    reference_target: str = REFERENCE_TARGET
    dimensions: list[Dimension]
    preference_curve: list[CurvePoint]
    layers: CurveLayers = CurveLayers()
    curve_reference: str = (
        "Offsets in dB relative to the Harman in-ear 2019 target (Olive et al.). IEMs are "
        "compared against that target plus these offsets."
    )
    assumptions: list[AssumptionOut] = Field(default_factory=list)
    summary: list[str]
    sources: dict[Source, bool]


# --- evidence as observations -------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Observation:
    value: float  # in the dimension's unit
    variance: float
    direct: bool
    note: str


@dataclass(frozen=True, slots=True)
class _MusicPrior:
    z: float
    se: float
    note: str


Answers = dict[str, str | None]


def _quantile(p: float) -> float:
    return _NORMAL.inv_cdf(min(max(p, 1e-4), 1 - 1e-4))


# Five-point scales map onto equal-probability bins of the population distribution
# (heuristic: each answer is assumed to cover a similar share of listeners).
EQUAL_5: Final = (0.1, 0.3, 0.5, 0.7, 0.9)
PRIORITY_5: Final = (0.1, 0.3, 0.5, 0.75, 0.95)
# Bass answers are anchored on Harman's listener classes: about 2 dB less bass, the
# target, and 4-6 dB more bass (Olive 2022); the outer and middle steps interpolate.
BASS_DB_5: Final = (-3.0, -2.0, 0.0, 2.5, 5.0)
BASS_CHARACTER_DB: Final = 1.0  # rumble vs punch tilts sub- against mid-bass (heuristic)


#: What listeners of each genre tend to want from the tonal balance, in dB against
#: the population reference — a RULE OF THUMB (genre EQ presets, reviewer
#: consensus), not a measured effect. It enters as one soft observation per
#: dimension (SD ``GENRE_SD``), so a listener's music, answers and ears all
#: outweigh it; on its own it moves a dimension about half way.
GENRE_LEAN: Final[dict[str, dict[str, float]]] = {
    "hip_hop": {"sub_bass": 4.0, "mid_bass": 3.0, "treble": -1.5},
    "electronic": {"sub_bass": 4.0, "mid_bass": 2.0},
    "pop": {"sub_bass": 2.0, "mid_bass": 1.5, "vocal_presence": 0.5},
    "bollywood": {"sub_bass": 2.0, "mid_bass": 1.5, "vocal_presence": 0.8},
    "rock_metal": {"mid_bass": 1.5, "treble": 1.0},
    "classical": {"warmth": 0.5, "treble": -0.5},
    "jazz_acoustic": {"warmth": 1.0, "treble": -0.5},
    "cinematic_gaming": {"sub_bass": 2.0},
}
GENRE_SD: Final = 3.0
GENRE_NAMES: Final[dict[str, str]] = {
    "hip_hop": "hip-hop",
    "electronic": "electronic",
    "pop": "pop",
    "bollywood": "Bollywood",
    "rock_metal": "rock and metal",
    "classical": "classical",
    "jazz_acoustic": "jazz and acoustic",
    "cinematic_gaming": "cinematic games",
}


def _genre_observations(
    genres: Sequence[str], primary: str | None
) -> dict[DimensionKey, list[_Observation]]:
    """One soft observation per tonal dimension: the weighted mean of the leans."""
    weights = {
        g: (2.0 if g == primary and len(genres) > 1 else 1.0) for g in genres if g in GENRE_LEAN
    }
    if not weights:
        return {}
    total = sum(weights.values())
    named = [GENRE_NAMES[g] for g in weights]
    note = "Rule of thumb for listeners of " + (
        named[0] if len(named) == 1 else ", ".join(named[:-1]) + " and " + named[-1]
    )
    out: dict[DimensionKey, list[_Observation]] = {}
    for dim in {d for g in weights for d in GENRE_LEAN[g]}:
        lean = sum(GENRE_LEAN[g].get(dim, 0.0) * w for g, w in weights.items()) / total
        if abs(lean) >= 0.25:
            out[dim] = [_Observation(lean, GENRE_SD**2, False, note)]  # type: ignore[index]
    return out


def _questionnaire_observations(
    answers: Answers, params: ModelParameters
) -> dict[DimensionKey, list[_Observation]]:
    out: dict[DimensionKey, list[_Observation]] = {}
    r_direct = params.answer_reliability
    r_indirect = params.answer_reliability * params.indirect_factor

    def add(dim: DimensionKey, value: float, note: str, direct: bool = True) -> None:
        sigma = DIMENSIONS[dim].scale(params)
        r = r_direct if direct else r_indirect
        out.setdefault(dim, []).append(_Observation(value, sigma**2 * (1 - r) / r, direct, note))

    def level(qid: str, levels: Sequence[float]) -> float | None:
        answer = answers.get(qid)
        return levels[int(answer) - 1] if answer is not None else None

    def quantile_obs(dim: DimensionKey, p: float | None, note: str, direct: bool = True) -> None:
        if p is not None:
            add(dim, DIMENSIONS[dim].scale(params) * _quantile(p), note, direct)

    bass = level("bass_amount", BASS_DB_5)
    character = answers.get("bass_character")
    tilt = {"rumble": BASS_CHARACTER_DB, "punch": -BASS_CHARACTER_DB}.get(character or "", 0.0)
    if bass is not None:
        note = "From how much bass you enjoy"
        if tilt:
            note += f" and your preference for {character}"
        add("sub_bass", bass + tilt, note)
        add("mid_bass", bass - tilt, note)
    elif tilt:
        add("sub_bass", tilt, f"You prefer {character} in the bass", direct=False)
        add("mid_bass", -tilt, f"You prefer {character} in the bass", direct=False)

    quantile_obs("vocal_presence", level("vocals", EQUAL_5), "From where you like vocals to sit")

    treble = answers.get("treble_feel")
    if treble is not None:
        index = ["harsh", "sometimes", "fine", "sparkle"].index(treble)
        note = "From how bright highs usually feel to you"
        quantile_obs("treble", (0.15, 0.35, 0.6, 0.85)[index], note)
        quantile_obs("treble_tolerance", (0.1, 0.35, 0.65, 0.9)[index], note)
        quantile_obs("air", (0.3, 0.45, 0.55, 0.7)[index], note, direct=False)

    tone = level("tone", (0.9, 0.7, 0.5, 0.3, 0.1))
    quantile_obs("warmth", tone, "From whether you lean warm or crisp")
    if tone is not None:
        quantile_obs("treble", 1 - tone, "From whether you lean warm or crisp", direct=False)

    quantile_obs("energy", level("energy", EQUAL_5), "From how energetic you want music to feel")
    quantile_obs("detail", level("detail", PRIORITY_5), "From how much you value detail")
    quantile_obs("soundstage", level("soundstage", PRIORITY_5), "From how much you value space")
    quantile_obs("naturalness", level("naturalness", PRIORITY_5), "From how much you value realism")
    return out


# What music can speak to. Treble tolerance and the priorities are about how someone
# experiences sound, which a library's content doesn't reveal.
MUSIC_MEASURES: Final[frozenset[DimensionKey]] = frozenset(
    {"sub_bass", "mid_bass", "warmth", "vocal_presence", "treble", "air", "energy"}
)
# Below this share of full-bandwidth songs, lossy codecs, not the music, set the top end.
MIN_CODEC_COVERAGE: Final = 0.5
_MEDIAN_SE: Final = math.sqrt(math.pi / 2)


def _describe_content(z: float) -> str:
    if abs(z) < 0.25:
        return "close to typical music"
    side = "above" if z > 0 else "below"
    return f"{'a little' if abs(z) < 0.75 else 'well'} {side} typical music"


def _music_priors(music: MusicProfileData) -> dict[DimensionKey, _MusicPrior]:
    """Library balance per dimension, in reference-corpus spread units, with its SE."""
    bands = {b.key: b for b in music.bands}
    descriptors = {d.key: d for d in music.descriptors}
    n_eff = max(music.counts.effective, 1.0)

    def band_z(key: BandKey) -> tuple[float, float, float]:
        band = bands[key]
        coverage = band.coverage
        if band.balance_z is not None:
            return band.balance_z.estimate, band.balance_z.se, coverage
        # Profiles from music-profile/1: emphasis = logistic(z) per song, and the median
        # commutes with a monotone map, so logit(median emphasis) is the median z.
        e = min(max(band.emphasis.median, 1e-4), 1 - 1e-4)
        return math.log(e / (1 - e)), _MEDIAN_SE / math.sqrt(n_eff), coverage

    def combine(what: str, *keys: BandKey) -> _MusicPrior | None:
        parts = [band_z(k) for k in keys]
        if min(p[2] for p in parts) < MIN_CODEC_COVERAGE:
            return None  # the codec, not the music, decides this band
        z = sum(p[0] for p in parts) / len(parts)
        se = math.sqrt(sum(p[1] ** 2 for p in parts)) / len(parts)
        return _MusicPrior(z, se, f"Your songs' {what} is {_describe_content(z)}")

    priors: dict[DimensionKey, _MusicPrior | None] = {
        "sub_bass": combine("sub-bass content", "sub_bass"),
        "mid_bass": combine("mid-bass content", "mid_bass"),
        "warmth": combine("lower-midrange content", "lower_mids"),
        "vocal_presence": combine("upper-midrange content", "upper_mids", "presence"),
        "treble": combine("treble content", "lower_treble", "upper_treble"),
        "air": combine("air-band content", "air"),
    }
    energy = descriptors.get("energy")
    if energy is not None:
        if energy.z is not None:
            z, se = energy.z.estimate, energy.z.se
        else:
            e = min(max(energy.value.median, 1e-4), 1 - 1e-4)
            z, se = math.log(e / (1 - e)), _MEDIAN_SE / math.sqrt(n_eff)
        priors["energy"] = _MusicPrior(z, se, f"Your songs' energy is {_describe_content(z)}")
    return {k: v for k, v in priors.items() if v is not None}


def _feedback_observations(
    feedback: Sequence[FeedbackSignal], params: ModelParameters
) -> dict[DimensionKey, list[_Observation]]:
    """A reaction ("wanted more") is read as a half-SD step, as reliable as an answer."""
    out: dict[DimensionKey, list[_Observation]] = {}
    r = params.answer_reliability
    for signal in feedback:
        sigma = DIMENSIONS[signal.dimension].scale(params)
        out.setdefault(signal.dimension, []).append(
            _Observation(
                0.5 * sigma * signal.direction,
                sigma**2 * (1 - r) / r,
                True,
                signal.note or ("Wanted more" if signal.direction > 0 else "Wanted less"),
            )
        )
    return out


# --- the posterior --------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Posterior:
    mean: float
    var: float


def _combine(prior: _Posterior, observations: Sequence[_Observation]) -> _Posterior:
    precision = 1 / prior.var + sum(1 / o.variance for o in observations)
    weighted = prior.mean / prior.var + sum(o.value / o.variance for o in observations)
    return _Posterior(weighted / precision, 1 / precision)


def _music_prior(sigma: float, music: _MusicPrior | None, rho: float) -> _Posterior:
    if music is None or rho == 0:
        return _Posterior(0.0, sigma**2)
    return _Posterior(
        rho * sigma * music.z,
        sigma**2 * (1 - rho**2) + (rho * sigma * music.se) ** 2,
    )


def _percentile(mean: float, sigma: float) -> float:
    return round(_NORMAL.cdf(mean / sigma), 3)


def _music_support(explained: float) -> MusicSupport:
    if explained >= MUSIC_STRONG:
        return "strong"
    if explained >= MUSIC_MODERATE:
        return "moderate"
    return "limited" if explained > 0.02 else "none"


def _agreement(music_mean: float, answer_mean: float, sigma: float) -> Agreement:
    """How the listener's answers relate to what their music suggests."""
    if abs(answer_mean - music_mean) <= 0.35 * sigma:
        return "agree"
    lean_music = music_mean if abs(music_mean) >= 0.15 * sigma else 0.0
    lean_answer = answer_mean if abs(answer_mean) >= 0.15 * sigma else 0.0
    return "differ" if lean_music * lean_answer < 0 else "refine"


@dataclass(frozen=True, slots=True)
class _Estimate:
    dimension: Dimension
    posterior: _Posterior
    music_only: _Posterior | None
    answers_only: _Posterior | None


def _dimension(
    key: DimensionKey,
    music: _MusicPrior | None,
    answers: Sequence[_Observation],
    feedback: Sequence[_Observation],
    params: ModelParameters,
    listening: Sequence[_Observation] = (),
    genre: Sequence[_Observation] = (),
) -> _Estimate:
    spec = DIMENSIONS[key]
    sigma = spec.scale(params)
    rho = params.music_correlation
    anchored = _music_prior(sigma, music, rho)
    posterior = _combine(anchored, [*answers, *feedback, *listening, *genre])
    music_only = anchored if music is not None and rho != 0 else None
    answers_only = _combine(_Posterior(0.0, sigma**2), answers) if answers else None

    precision = 1 / posterior.var
    evidence: list[Evidence] = []
    if music_only is not None and music is not None:
        evidence.append(
            Evidence(
                source="music",
                value=_percentile(music_only.mean, sigma),
                weight=round((1 / anchored.var) / precision, 3),
                note=music.note,
                status="derived",
            )
        )
    else:
        evidence.append(
            Evidence(
                source="prior",
                value=0.5,
                weight=round((1 / anchored.var) / precision, 3),
                note="Population reference (Harman research)"
                if spec.unit == "dB"
                else "Population median",
                status="literature" if spec.unit == "dB" else "heuristic",
            )
        )
    sources: tuple[tuple[Source, Sequence[_Observation]], ...] = (
        ("listening", listening),
        ("questionnaire", answers),
        ("feedback", feedback),
    )
    for source, items in sources:
        if items:
            evidence.append(
                Evidence(
                    source=source,
                    value=_percentile(_combine(_Posterior(0.0, sigma**2), items).mean, sigma),
                    weight=round(sum(1 / o.variance for o in items) / precision, 3),
                    note="; ".join(dict.fromkeys(o.note for o in items)),
                    status="user_provided",
                )
            )
    if genre:
        evidence.append(
            Evidence(
                source="genre",
                value=_percentile(_combine(_Posterior(0.0, sigma**2), genre).mean, sigma),
                weight=round(sum(1 / o.variance for o in genre) / precision, 3),
                note=genre[0].note,
                status="heuristic",
            )
        )

    explained = 1 - anchored.var / sigma**2 if music_only is not None else 0.0
    answer_support: AnswerSupport = "none"
    if answers:
        answer_support = "direct" if any(o.direct for o in answers) else "indirect"
    agreement = None
    if music_only is not None and answers_only is not None and explained >= MUSIC_MODERATE:
        agreement = _agreement(music_only.mean, answers_only.mean, sigma)

    return _Estimate(
        Dimension(
            key=key,
            label=spec.label,
            group=spec.group,
            description=spec.description,
            low_label=spec.low,
            high_label=spec.high,
            value=_percentile(posterior.mean, sigma),
            confidence=round(max(0.0, 1 - posterior.var / sigma**2), 3),
            unit=spec.unit,
            mean=round(posterior.mean, 3),
            sd=round(math.sqrt(posterior.var), 3),
            measurable_from_music=key in MUSIC_MEASURES,
            music_value=_percentile(music_only.mean, sigma) if music_only else None,
            answer_value=_percentile(answers_only.mean, sigma) if answers_only else None,
            basis=Basis(
                music=_music_support(explained), answers=answer_support, agreement=agreement
            ),
            evidence=evidence,
        ),
        posterior,
        music_only,
        answers_only,
    )


# --- the curve --------------------------------------------------------------------------

_MUSIC_ORDER: Final[tuple[MusicSupport, ...]] = ("none", "limited", "moderate", "strong")
_ANSWER_ORDER: Final[tuple[AnswerSupport, ...]] = ("none", "indirect", "direct")
_AGREEMENT_ORDER: Final[tuple[Agreement, ...]] = ("differ", "refine", "agree")

# Which dimensions set each band; the midrange band is the fixed reference.
CURVE_SOURCES: Final[dict[BandKey, tuple[DimensionKey, ...]]] = {
    "sub_bass": ("sub_bass",),
    "mid_bass": ("mid_bass",),
    "lower_mids": ("warmth",),
    "mids": (),
    "upper_mids": ("vocal_presence",),
    "presence": ("vocal_presence", "treble"),
    "lower_treble": ("treble",),
    "upper_treble": ("treble",),
    "air": ("air",),
}


def _merge_basis(bases: Sequence[Basis]) -> Basis:
    """A band resting on several dimensions is only as well supported as the weakest."""
    if not bases:
        return Basis(music="none", answers="none")
    agreements = {b.agreement for b in bases}
    return Basis(
        music=min((b.music for b in bases), key=_MUSIC_ORDER.index),
        answers=min((b.answers for b in bases), key=_ANSWER_ORDER.index),
        agreement=next((a for a in _AGREEMENT_ORDER if a in agreements), None),
    )


def _band_posterior(
    keys: tuple[DimensionKey, ...], posteriors: dict[DimensionKey, _Posterior | None]
) -> _Posterior | None:
    parts = [posteriors[k] for k in keys]
    if not parts or any(p is None for p in parts):
        return None
    return _Posterior(
        sum(p.mean for p in parts if p) / len(parts),
        sum(p.var for p in parts if p) / len(parts) ** 2,
    )


def _curve(
    estimates: dict[DimensionKey, _Estimate],
    which: Literal["posterior", "music_only", "answers_only"],
    tolerance_cap_db: float | None,
    params: ModelParameters,
    alone: Sequence[list[CurvePoint]] = (),
) -> list[CurvePoint]:
    prior = {k: _Posterior(0.0, spec.scale(params) ** 2) for k, spec in DIMENSIONS.items()}
    # A single-source layer falls back to the population prior where that source is silent.
    posteriors = {k: getattr(e, which) or prior[k] for k, e in estimates.items()}
    points = []
    for i, band in enumerate(BANDS):
        keys = CURVE_SOURCES[band.key]
        post = _band_posterior(keys, posteriors) if keys else _Posterior(0.0, 0.0)
        assert post is not None
        mean = post.mean
        if band.key == "lower_treble" and tolerance_cap_db is not None:
            mean = min(mean, tolerance_cap_db)  # heuristic: sensitivity caps the bite region
        sd = math.sqrt(post.var)
        edges = [
            mean - CREDIBLE_Z * sd,
            mean + CREDIBLE_Z * sd,
            *(layer[i].offset_db for layer in alone),
        ]
        dims = [estimates[k].dimension for k in keys]
        points.append(
            CurvePoint(
                band=band.key,
                label=band.label,
                center_hz=round(band.center_hz, 1),
                offset_db=round(mean, 2),
                confidence=round(min((d.confidence for d in dims), default=1.0), 3),
                sd_db=round(sd, 2),
                low_db=round(min(edges), 2),
                high_db=round(max(edges), 2),
                reference=not keys,
                basis=_merge_basis([d.basis for d in dims]),
            )
        )
    return points


def _tolerance_cap(
    estimates: dict[DimensionKey, _Estimate], params: ModelParameters
) -> float | None:
    """Sensitive listeners' lower treble is capped at their tolerance level (heuristic).

    Applies only when tolerance was actually answered; the cap is the tolerance
    estimate (in SD units) expressed on the treble scale.
    """
    tolerance = estimates["treble_tolerance"]
    if tolerance.answers_only is None:
        return None
    return params.sd_treble_db * tolerance.posterior.mean


# --- summary ----------------------------------------------------------------------------


def basis_phrase(d: Dimension) -> str:
    """Where a dimension's value comes from, as a clause."""
    basis = d.basis
    has_music = basis.music in {"strong", "moderate"}
    music_neutral = d.music_value is None or abs(d.music_value - 0.5) < 0.05
    if has_music and basis.agreement == "differ":
        return "though your music and your answers point different ways"
    if has_music and basis.agreement == "agree":
        return "from your music, confirmed by your answers"
    if has_music and basis.agreement == "refine":
        if music_neutral:
            return "from your answers; your music is close to neutral here"
        return "from your music, refined by your answers"
    if has_music:
        return "from your music"
    if basis.answers != "none":
        return "from your answers"
    return "on limited evidence"


def _summary(dims: dict[DimensionKey, Dimension]) -> list[str]:
    lines = []
    ranked = sorted(
        (d for d in dims.values() if d.group in {"tonal", "character"} and d.confidence >= 0.3),
        key=lambda d: abs(d.value - 0.5) * d.confidence,
        reverse=True,
    )
    for d in ranked[:3]:
        if abs(d.value - 0.5) < 0.12:
            continue
        side = d.high_label if d.value > 0.5 else d.low_label
        amount = f" ({d.mean:+.1f} dB vs the reference)" if d.unit == "dB" else ""
        lines.append(f"{d.label}: leaning {side.lower()}{amount}, {basis_phrase(d)}.")
    tol = dims["treble_tolerance"]
    if tol.value < 0.3 and tol.confidence >= 0.3:
        lines.append("You're sensitive to bright treble, so sharp-sounding tunings are a poor fit.")
    top = max((dims[k] for k in ("detail", "soundstage", "naturalness")), key=lambda d: d.value)
    if top.value >= 0.75 and top.confidence >= 0.3:
        lines.append(f"{top.label} is a high priority for you.")
    if not lines:
        lines.append("Your preferences sit close to the reference so far.")
    return lines


# --- entry point ------------------------------------------------------------------------


ListeningEvidence = dict[str, list[tuple[float, float, str]]]


def _listening_observations(listening: ListeningEvidence | None) -> dict[str, list[_Observation]]:
    """Listening-session evidence (see :mod:`auralis.tuning.inference`): value, variance."""
    return {
        dim: [_Observation(value, variance, True, note) for value, variance, note in obs]
        for dim, obs in (listening or {}).items()
    }


def estimate(
    *,
    music: MusicProfileData | None,
    answers: Answers | None,
    feedback: Sequence[FeedbackSignal] = (),
    params: ModelParameters = DEFAULT,
    listening: ListeningEvidence | None = None,
    genres: Sequence[str] = (),
    primary_genre: str | None = None,
) -> dict[DimensionKey, _Estimate]:
    from_genres = _genre_observations(genres, primary_genre)
    from_music = _music_priors(music) if music else {}
    from_answers = _questionnaire_observations(answers, params) if answers else {}
    from_feedback = _feedback_observations(feedback, params)
    from_listening = _listening_observations(listening)
    return {
        key: _dimension(
            key,
            from_music.get(key),
            from_answers.get(key, []),
            from_feedback.get(key, []),
            params,
            from_listening.get(key, []),
            from_genres.get(key, []),
        )
        for key in DIMENSIONS
    }


def fuse(
    *,
    music: MusicProfileData | None,
    answers: Answers | None,
    feedback: Sequence[FeedbackSignal] = (),
    params: ModelParameters = DEFAULT,
    listening: ListeningEvidence | None = None,
    genres: Sequence[str] = (),
    primary_genre: str | None = None,
) -> SoundProfileData:
    has_answers = bool(answers) and any(v is not None for v in (answers or {}).values())
    estimates = estimate(
        music=music,
        answers=answers,
        feedback=feedback,
        params=params,
        listening=listening,
        genres=genres,
        primary_genre=primary_genre,
    )
    cap = _tolerance_cap(estimates, params)
    has_music = any(e.music_only is not None for e in estimates.values())
    music_layer = _curve(estimates, "music_only", None, params) if has_music else None
    answers_layer = _curve(estimates, "answers_only", cap, params) if has_answers else None
    curve = _curve(
        estimates,
        "posterior",
        cap,
        params,
        [layer for layer in (music_layer, answers_layer) if layer],
    )
    dims = {k: e.dimension for k, e in estimates.items()}
    return SoundProfileData(
        dimensions=list(dims.values()),
        preference_curve=curve,
        layers=CurveLayers(music=music_layer, answers=answers_layer),
        assumptions=params.describe(),
        summary=_summary(dims),
        sources={
            "prior": True,
            "music": music is not None,
            "questionnaire": has_answers,
            "feedback": bool(feedback),
            "listening": bool(listening),
            "genre": bool(_genre_observations(genres, primary_genre)),
        },
    )
