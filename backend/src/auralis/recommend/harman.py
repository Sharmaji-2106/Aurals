"""Content-based recommender built on the Harman in-ear research (``harman-personal/1``).

For every candidate IEM (measured on the same rig family as the target):

1. **Error against your target.** Your target is the reference (Harman in-ear 2019)
   plus your preference offsets, interpolated in log-frequency between band centres.
   The error is the measured response minus that target, both aligned at 500 Hz.
2. **Predicted preference.** The Olive, Welti & Khonsaripour (2017) in-ear model turns
   the error curve into a 0-100 rating. Against the reference target this is the
   published model; against a personal target it is an extension (heuristic): the model
   was fitted to average listeners and the reference target.
3. **Your uncertainty.** The preference offsets are posterior distributions, not points.
   The score is computed for draws from them, and each IEM is ranked by its expected
   score with an 80 % range. Deterministic: the draws are seeded.
4. **Reasons** come from the same error curve, region by region, compared with the
   width of your target's range there. Nothing is written that isn't computed.

Regions above 10 kHz are reported as unreliable: IEC 60318-4 couplers are specified to
10 kHz, and the preference model stops there too.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Final, Literal

import numpy as np
import numpy.typing as npt

from auralis.acoustics import fr
from auralis.acoustics.bands import BANDS, BandKey, band_mask
from auralis.recommend.base import (
    BandValue,
    Candidate,
    Constraints,
    Match,
    Prediction,
    Price,
    Reason,
    Recommendation,
    Region,
    RegionFit,
    Target,
    driver_category,
)
from auralis.sound_profile.fusion import (
    CREDIBLE_Z,
    CURVE_SOURCES,
    Basis,
    SoundProfileData,
)

SAMPLES: Final = 256
CHUNK: Final = 1  # candidates scored together; measured: larger chunks are slower (memory-bound)
MIN_TOLERANCE_DB: Final = 1.0  # roughly the smallest broadband change listeners notice


@dataclass(frozen=True, slots=True)
class RegionSpec:
    key: Region
    label: str
    low_hz: float
    high_hz: float
    bands: tuple[BandKey, ...]
    reliable: bool
    more: str  # how "measured above your target" reads
    less: str


REGIONS: Final[tuple[RegionSpec, ...]] = (
    RegionSpec("bass", "Bass", 20, 200, ("sub_bass", "mid_bass"), True, "more bass", "less bass"),
    RegionSpec(
        "lower_mids",
        "Lower mids",
        200,
        500,
        ("lower_mids",),
        True,
        "a fuller, warmer lower midrange",
        "a leaner lower midrange",
    ),
    RegionSpec(
        "vocals",
        "Vocals and presence",
        1200,
        5000,
        ("upper_mids", "presence"),
        True,
        "more forward vocals",
        "more distant vocals",
    ),
    RegionSpec(
        "treble",
        "Treble",
        5000,
        10000,
        ("lower_treble", "upper_treble"),
        True,
        "brighter treble",
        "softer treble",
    ),
    RegionSpec("air", "Air", 10000, 20000, ("air",), False, "more air", "less air"),
)

# Word labels for the predicted rating, after the quality categories Olive et al. (2018)
# sorted headphones into (excellent 90-100, good 65-76, fair 42-54, poor < 40). The exact
# cut points between their categories are an Auralis choice.
MATCH_BANDS: Final[tuple[tuple[float, Match], ...]] = (
    (80.0, "close"),
    (62.0, "good"),
    (45.0, "partial"),
)


def match_word(score: float) -> Match:
    for threshold, word in MATCH_BANDS:
        if score >= threshold:
            return word
    return "poor"


def _seed(profile: SoundProfileData) -> int:
    key = "|".join(f"{c.band}:{c.offset_db}:{c.sd_db}" for c in profile.preference_curve)
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "little")


def _slug_seed(slug: str) -> int:
    return int.from_bytes(hashlib.sha256(slug.encode()).digest()[:8], "little")


def band_centers() -> npt.NDArray[np.float64]:
    return np.array([b.center_hz for b in BANDS])


def curve_draws(
    profile: SoundProfileData, n: int, rng: np.random.Generator
) -> npt.NDArray[np.float64]:
    """Draws of the nine band offsets (n x 9) from the profile's posterior.

    Sampled per dimension, not per band, so bands that share a dimension (e.g. lower and
    upper treble) move together. The treble-tolerance cap is applied as stored.
    """
    dims = {d.key: d for d in profile.dimensions if d.unit == "dB"}
    draws = {k: d.mean + d.sd * rng.standard_normal(n) for k, d in dims.items()}
    curve = {c.band: c for c in profile.preference_curve}
    treble = dims.get("treble")
    cap = (
        curve["lower_treble"].offset_db
        if treble is not None and curve["lower_treble"].offset_db < treble.mean - 0.01
        else None
    )
    out = np.zeros((n, len(BANDS)))
    for i, band in enumerate(BANDS):
        keys = CURVE_SOURCES[band.key]
        if not keys or any(k not in draws for k in keys):
            continue
        values = sum(draws[k] for k in keys) / len(keys)
        if band.key == "lower_treble" and cap is not None:
            values = np.minimum(values, cap)
        out[:, i] = values
    return out


def offsets_on(
    freqs_hz: npt.NDArray[np.float64], band_offsets: npt.NDArray[np.float64]
) -> npt.NDArray[np.float64]:
    """Band offsets interpolated in log-frequency (last axis), held flat beyond the ends."""
    x = np.log2(freqs_hz)
    xp = np.log2(band_centers())
    flat = band_offsets.reshape(-1, band_offsets.shape[-1])
    rows = np.array([np.interp(x, xp, row) for row in flat])
    return rows.reshape(*band_offsets.shape[:-1], x.size)


def _within_budget(price: Price | None, constraints: Constraints) -> bool:
    if price is None or constraints.currency is None or price.currency != constraints.currency:
        return True  # unknown or incomparable prices are flagged, never silently dropped
    if constraints.budget_min is not None and price.amount < constraints.budget_min:
        return False
    return constraints.budget_max is None or price.amount <= constraints.budget_max


def _basis_words(basis: Basis) -> str:
    solid = basis.music in {"strong", "moderate"}
    if solid and basis.agreement == "differ":
        return "your music and answers disagree here"
    if solid and basis.answers != "none":
        return "your music, refined by your answers"
    if solid:
        return "your music"
    if basis.answers != "none":
        return "your answers"
    return "the population reference"


@dataclass(frozen=True, slots=True)
class _Scored:
    candidate: Candidate
    personal: Prediction
    population: float
    error_mean: npt.NDArray[np.float64]  # R40, against the posterior-mean target


class HarmanPersonalRecommender:
    version = "harman-personal/1"

    def __init__(self, samples: int = SAMPLES) -> None:
        self.samples = samples

    def score(
        self, profile: SoundProfileData, candidates: list[Candidate], target: Target
    ) -> list[_Scored]:
        rng = np.random.default_rng(_seed(profile))
        draws = curve_draws(profile, self.samples, rng)  # S x 9
        mean_offsets = np.array([c.offset_db for c in profile.preference_curve])
        personal_draws = offsets_on(fr.R40_HZ, draws)  # S x F
        personal_mean = offsets_on(fr.R40_HZ, mean_offsets[None, :])[0]
        reference = fr.interpolate(fr.Curve(target.freqs_hz, target.db), fr.R40_HZ)

        if not candidates:
            return []
        responses = np.array(
            [fr.interpolate(fr.Curve(c.freqs_hz, c.response_db), fr.R40_HZ) for c in candidates]
        )
        error_ref = responses - reference[None, :]  # N x F
        population = fr.olive_score(*fr.olive_terms(error_ref))  # N
        on_r40: dict[int, npt.NDArray[np.float64]] = {}

        scored = []
        # In chunks: all draws of a few dozen candidates at once is fast and small.
        for lo in range(0, len(candidates), CHUNK):
            chunk = candidates[lo : lo + CHUNK]
            errors = error_ref[lo : lo + CHUNK, None, :] - personal_draws[None, :, :]
            # The expected rating is the converted curve's own; the conversion's error
            # widens the range only. Folding it into the mean would mark down every
            # converted earphone for noise directly measured ones also carry.
            centre = fr.olive_score(*fr.olive_terms(errors)).mean(axis=1)
            for i, c in enumerate(chunk):
                if c.transfer_residuals is None:
                    continue
                # A converted measurement: each draw takes one residual observed between
                # the two rigs, so the range carries the conversion's own error.
                pick = np.random.default_rng(_seed(profile) ^ _slug_seed(c.slug)).integers(
                    0, len(c.transfer_residuals), self.samples
                )
                key = id(c.transfer_residuals)
                if key not in on_r40:  # one transfer is shared by every converted candidate
                    on_r40[key] = np.array(
                        [
                            fr.interpolate(fr.Curve(c.freqs_hz, row), fr.R40_HZ)
                            for row in c.transfer_residuals
                        ]
                    )
                errors[i] = errors[i] - on_r40[key][pick]
            scores = fr.olive_score(*fr.olive_terms(errors))  # n x S
            means = centre
            lows, highs = np.percentile(scores, [10, 90], axis=1)
            for i, c in enumerate(chunk):
                scored.append(
                    _Scored(
                        c,
                        Prediction(
                            mean=round(float(means[i]), 1),
                            low=round(float(lows[i]), 1),
                            high=round(float(highs[i]), 1),
                        ),
                        round(float(population[lo + i]), 1),
                        error_ref[lo + i] - personal_mean,
                    )
                )
        return scored

    def recommend(
        self,
        profile: SoundProfileData,
        candidates: list[Candidate],
        target: Target,
        constraints: Constraints,
        *,
        limit: int = 10,
    ) -> list[Recommendation]:
        scored = self.ranked(profile, candidates, target, constraints)
        return [
            self.explain(profile, s, rank, target, constraints)
            for rank, s in enumerate(scored[:limit], start=1)
        ]

    def ranked(
        self,
        profile: SoundProfileData,
        candidates: list[Candidate],
        target: Target,
        constraints: Constraints,
    ) -> list[_Scored]:
        """Every eligible candidate, scored and in rank order (explained on demand)."""
        eligible = [
            c
            for c in candidates
            if c.scored_on == target.rig_family == constraints.rig_family
            and _within_budget(c.price, constraints)
            and fr.olive_inear(
                fr.compensate(fr.Curve(c.freqs_hz, c.response_db), fr.Curve(c.freqs_hz, target.db))
            )
            is not None
        ]
        return sorted(self.score(profile, eligible, target), key=self.rank_key)

    def explain(
        self,
        profile: SoundProfileData,
        s: _Scored,
        rank: int,
        target: Target,
        constraints: Constraints,
    ) -> Recommendation:
        return self._explain(profile, s, rank, target, constraints)

    def rank_key(self, s: _Scored) -> float:
        """Lower sorts first: the expected predicted preference, highest first."""
        return -s.personal.mean

    def _explain(
        self,
        profile: SoundProfileData,
        s: _Scored,
        rank: int,
        target: Target,
        constraints: Constraints,
    ) -> Recommendation:
        curve = {c.band: c for c in profile.preference_curve}
        regions = [self._region(spec, s.error_mean, curve) for spec in REGIONS]
        reasons = _reasons(profile, regions, s, constraints)
        return Recommendation(
            iem_id=s.candidate.iem_id,
            brand=s.candidate.brand,
            model=s.candidate.model,
            slug=s.candidate.slug,
            rank=rank,
            match=match_word(s.personal.mean),
            predicted_preference=s.personal,
            population_preference=s.population,
            price=s.candidate.price,
            driver_config=s.candidate.driver_config,
            driver_category=driver_category(s.candidate.driver_config),
            image=s.candidate.image,
            regions=regions,
            bands=_band_values(s.candidate, target),
            reasons=reasons,
            measurement=s.candidate.measurement,
        )

    @staticmethod
    def _region(spec: RegionSpec, error: npt.NDArray[np.float64], curve: dict) -> RegionFit:  # type: ignore[type-arg]
        freqs = fr.R40_HZ
        mask = (freqs >= spec.low_hz) & (freqs < spec.high_hz)
        values = error[mask]
        values = values[np.isfinite(values)]
        points = [curve[b] for b in spec.bands]
        sd = float(np.mean([p.sd_db for p in points]))
        tolerance = round(max(MIN_TOLERANCE_DB, CREDIBLE_Z * sd), 2)
        target_db = round(float(np.mean([p.offset_db for p in points])), 2)
        bases = [p.basis for p in points]
        basis = min(bases, key=lambda b: ("none", "limited", "moderate", "strong").index(b.music))
        if not values.size:
            mean_error = None
            fit: Literal["within", "above", "below", "unreliable"] = "unreliable"
        else:
            mean_error = round(float(values.mean()), 2)
            if not spec.reliable:
                fit = "unreliable"
            elif abs(mean_error) <= tolerance:
                fit = "within"
            else:
                fit = "above" if mean_error > 0 else "below"
        return RegionFit(
            region=spec.key,
            label=spec.label,
            low_hz=spec.low_hz,
            high_hz=spec.high_hz,
            error_db=mean_error,
            tolerance_db=tolerance,
            fit=fit,
            target_db=target_db,
            target_basis=_basis_words(basis),
        )


def _band_values(c: Candidate, target: Target) -> list[BandValue]:
    """The IEM's deviation from the reference per band (1/6-octave smoothed), in the
    same terms as the preference curve, so the two can be drawn together."""
    deviation = fr.smooth(
        fr.compensate(fr.Curve(c.freqs_hz, c.response_db), fr.Curve(c.freqs_hz, target.db))
    )
    values = []
    for band in BANDS:
        chunk = deviation.db[band_mask(deviation.freqs_hz, band)]
        values.append(
            BandValue(
                band=band.key,
                center_hz=round(band.center_hz, 1),
                measured_db=round(float(np.nanmean(chunk)), 2)
                if np.any(np.isfinite(chunk))
                else None,
            )
        )
    return values


def _reasons(
    profile: SoundProfileData,
    regions: list[RegionFit],
    s: _Scored,
    constraints: Constraints,
) -> list[Reason]:
    specs = {r.key: r for r in REGIONS}
    reasons: list[Reason] = []
    matches = sorted(
        (r for r in regions if r.fit == "within"),
        key=lambda r: abs(r.target_db),
        reverse=True,
    )
    for r in matches[:2]:
        where = (
            f"your target here is {r.target_db:+.1f} dB from the reference, from {r.target_basis}"
            if abs(r.target_db) >= 0.5
            else f"your target here is close to the reference ({r.target_basis})"
        )
        reasons.append(
            Reason(
                kind="match",
                region=r.region,
                message=f"{r.label}: within {abs(r.error_db or 0):.1f} dB of your target, inside "
                f"your ±{r.tolerance_db:.1f} dB range; {where}.",
                error_db=r.error_db,
                tolerance_db=r.tolerance_db,
            )
        )
    mismatches = sorted(
        (r for r in regions if r.fit in ("above", "below") and r.error_db is not None),
        key=lambda r: abs(r.error_db or 0) - r.tolerance_db,
        reverse=True,
    )
    for r in mismatches[:2]:
        spec = specs[r.region]
        words = spec.more if r.fit == "above" else spec.less
        reasons.append(
            Reason(
                kind="mismatch",
                region=r.region,
                message=f"{r.label}: {abs(r.error_db or 0):.1f} dB {r.fit} your target "
                f"({words}), outside your ±{r.tolerance_db:.1f} dB range.",
                error_db=r.error_db,
                tolerance_db=r.tolerance_db,
            )
        )
    tolerance = next((d for d in profile.dimensions if d.key == "treble_tolerance"), None)
    treble = next((r for r in regions if r.region == "treble"), None)
    if (
        tolerance is not None
        and tolerance.value < 0.3
        and tolerance.basis.answers != "none"
        and treble is not None
        and treble.error_db is not None
        and treble.error_db > MIN_TOLERANCE_DB
    ):
        reasons.append(
            Reason(
                kind="mismatch",
                region="treble",
                message=f"Treble sits {treble.error_db:.1f} dB above your target, and you told "
                "us bright sound tends to tire you.",
                error_db=treble.error_db,
                status="user_provided",
            )
        )
    p = s.personal
    reasons.append(
        Reason(
            kind="note",
            message=f"Expected rating {p.mean:.0f} across the targets your evidence allows "
            f"(80% range {p.low:.0f}-{p.high:.0f}); {s.population:.0f} for the average listener "
            "against the reference target. Olive et al. in-ear model, 0-100 scale.",
            status="model_inferred",
        )
    )
    air = next((r for r in regions if r.region == "air"), None)
    if air is not None and air.error_db is not None and abs(air.error_db) > 3:
        reasons.append(
            Reason(
                kind="note",
                region="air",
                message=f"Above 10 kHz it measures {air.error_db:+.1f} dB from your target, but "
                "couplers are unreliable there, so this isn't scored.",
                error_db=air.error_db,
                status="measured",
            )
        )
    price = s.candidate.price
    if price is None:
        reasons.append(Reason(kind="note", message="No verified price, so budget wasn't checked."))
    elif constraints.currency and price.currency != constraints.currency:
        reasons.append(
            Reason(
                kind="note",
                message=f"Priced in {price.currency}; your budget is in {constraints.currency}, "
                "so it wasn't checked.",
            )
        )
    if s.candidate.measurement.variant:
        reasons.append(
            Reason(
                kind="note",
                message=f"Measured with {s.candidate.measurement.variant}.",
                status="measured",
            )
        )
    m = s.candidate.measurement
    if m.converted_to:
        reasons.append(
            Reason(
                kind="note",
                message=f"Measured by {m.source} on a clone coupler, then converted to the "
                f"reference rig using {m.conversion_pairs} earphones measured on both. The "
                "difference between those rigs is part of its range.",
                status="derived",
            )
        )
    return reasons
