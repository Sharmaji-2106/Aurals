"""Frequency-response (FR) measurement processing (``fr/2``).

Pipeline::

    raw points (Hz, dB) -> validate -> common 1/48-octave log grid (NaN outside the
    measured range) -> normalise at 500 Hz -> error against a rig-matched reference
    target -> 1/6-octave smoothing -> per-band features
                                    \\-> Olive et al. in-ear statistics (unsmoothed)

Conventions follow the Harman research so that the published predicted-preference
model applies (Olive, Welti & Khonsaripour 2017; Listen Inc. application note):

* curves are normalised at 500 Hz and the error curve is measurement minus target;
* the model's standard deviation and slope use 20 Hz-10 kHz on the ISO R40 (1/24
  octave) frequency series, the slope regressing on ln(frequency); the mean absolute
  error uses 40 Hz-10 kHz after aligning the error at 500 Hz (as implemented in AutoEq).

The raw curve is never modified: callers persist the original points with their
provenance and store the processed output alongside, tagged with
:data:`FR_PROCESSOR_VERSION`.

Measurement validity carried forward as per-band reliability weights: IEC 60318-4
occluded-ear simulators are specified for insert earphones from 100 Hz to 10 kHz and
have a half-wave resonance near 13.5 kHz; below ~100 Hz results depend on the seal.
The numeric weights inside and outside that range are Auralis heuristics.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, Literal

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel, Field

from auralis.acoustics.bands import BANDS, BANDS_VERSION, BandKey, band_mask, log_grid

FR_PROCESSOR_VERSION: Final = "fr/2"
GRID_POINTS_PER_OCTAVE: Final = 48
NORMALISATION_HZ: Final = 500.0
SMOOTHING_OCTAVE: Final = 1 / 6

RigFamily = Literal["iec60318-4"]
RIG_VALID_RANGE_HZ: Final[dict[str, tuple[float, float]]] = {"iec60318-4": (100.0, 10_000.0)}

# Relative trust in each band for an IEC 60318-4 measurement (see module docstring).
BAND_RELIABILITY: Final[dict[BandKey, float]] = {
    "sub_bass": 0.7,  # below the standard's range; seal-dependent
    "mid_bass": 0.9,  # partly below 100 Hz
    "lower_mids": 1.0,
    "mids": 1.0,
    "upper_mids": 1.0,
    "presence": 1.0,
    "lower_treble": 0.9,
    "upper_treble": 0.5,  # straddles the 10 kHz limit
    "air": 0.2,  # above the limit, near the coupler resonance
}

# ISO 3 R40 preferred numbers: the 1/24-octave series the preference model is run on.
_R40: Final = (
    1.00, 1.06, 1.12, 1.18, 1.25, 1.32, 1.40, 1.50, 1.60, 1.70,
    1.80, 1.90, 2.00, 2.12, 2.24, 2.36, 2.50, 2.65, 2.80, 3.00,
    3.15, 3.35, 3.55, 3.75, 4.00, 4.25, 4.50, 4.75, 5.00, 5.30,
    5.60, 6.00, 6.30, 6.70, 7.10, 7.50, 8.00, 8.50, 9.00, 9.50,
)  # fmt: skip
R40_HZ: Final[npt.NDArray[np.float64]] = np.array(
    [round(m * 10**e, 1) for e in range(1, 5) for m in _R40 if 20 <= m * 10**e <= 20_000]
)

# Olive, Welti & Khonsaripour (2017), in-ear model as implemented in AutoEq.
OLIVE_INTERCEPT: Final = 100.0795
OLIVE_SD: Final = 8.5
OLIVE_SLOPE: Final = 6.796
OLIVE_AAE: Final = 3.475


class FrValidationError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class Curve:
    freqs_hz: npt.NDArray[np.float64]
    db: npt.NDArray[np.float64]


class BandFeature(BaseModel):
    key: BandKey
    mean_db: float = Field(description="Mean level (or error) in the band, smoothed curve")
    reliability: float = Field(ge=0, le=1, description="Rig validity weight (heuristic)")
    coverage: float = Field(ge=0, le=1, description="Share of the band covered by raw data")


class OliveStats(BaseModel):
    """Error-curve statistics and the in-ear predicted-preference score (model-inferred)."""

    sd_db: float = Field(description="Standard deviation of the error, 20 Hz-10 kHz")
    slope_db: float = Field(description="Slope of the error regressed on ln(frequency)")
    aae_db: float = Field(description="Mean absolute error, 40 Hz-10 kHz, aligned at 500 Hz")
    score: float = Field(description="Predicted preference, 0-100 scale (may exceed 100)")
    coverage: float = Field(ge=0, le=1, description="Share of 20 Hz-10 kHz with data")


class FrFeatures(BaseModel):
    processor_version: str = FR_PROCESSOR_VERSION
    bands_version: str = BANDS_VERSION
    normalisation: str = f"{NORMALISATION_HZ:.0f} Hz = 0 dB (1/3-octave mean)"
    smoothing: str = f"1/{round(1 / SMOOTHING_OCTAVE)} octave (band features only)"
    compensated_against: str | None = Field(
        default=None, description="Reference target the band values are errors against"
    )
    rig_family: str | None = None
    bands: list[BandFeature]
    olive: OliveStats | None = None


def validate_points(points: Sequence[Sequence[float]], *, min_points: int = 20) -> Curve:
    """Reject obviously corrupt measurements. Never repairs data silently."""
    if len(points) < min_points:
        raise FrValidationError(f"expected at least {min_points} points, got {len(points)}")
    arr = np.asarray(points, dtype=np.float64)
    if arr.ndim != 2 or arr.shape[1] != 2:
        raise FrValidationError("points must be (frequency_hz, db) pairs")
    if not np.all(np.isfinite(arr)):
        raise FrValidationError("points contain NaN or infinite values")
    freqs, db = arr[:, 0], arr[:, 1]
    if np.any(freqs <= 0):
        raise FrValidationError("frequencies must be positive")
    if np.any(np.diff(freqs) <= 0):
        raise FrValidationError("frequencies must be strictly increasing")
    if freqs[0] > 100 or freqs[-1] < 10_000:
        raise FrValidationError(
            f"curve covers {freqs[0]:.0f}-{freqs[-1]:.0f} Hz; need at least 100 Hz-10 kHz"
        )
    if np.ptp(db) > 80:
        raise FrValidationError("a level range above 80 dB is implausible for an FR curve")
    return Curve(freqs_hz=freqs, db=db)


def interpolate(curve: Curve, freqs_hz: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    """Linear in log-frequency; NaN outside the curve's data (unknown stays unknown)."""
    known = np.isfinite(curve.db)
    if not np.any(known):
        return np.full(freqs_hz.shape, np.nan)
    x, y = np.log2(curve.freqs_hz[known]), curve.db[known]
    return np.asarray(np.interp(np.log2(freqs_hz), x, y, left=np.nan, right=np.nan))


def to_grid(curve: Curve, points_per_octave: int = GRID_POINTS_PER_OCTAVE) -> Curve:
    """Interpolate onto the common log grid."""
    grid = log_grid(points_per_octave)
    return Curve(freqs_hz=grid, db=interpolate(curve, grid))


def normalise(curve: Curve, at_hz: float = NORMALISATION_HZ) -> Curve:
    """Set the level around ``at_hz`` to 0 dB (mean over 1/3 octave, robust to ripple)."""
    mask = (curve.freqs_hz >= at_hz * 2 ** (-1 / 6)) & (curve.freqs_hz <= at_hz * 2 ** (1 / 6))
    values = curve.db[mask]
    if not np.any(np.isfinite(values)):
        raise FrValidationError(f"curve has no data around {at_hz:.0f} Hz")
    return Curve(freqs_hz=curve.freqs_hz, db=curve.db - float(np.nanmean(values)))


def smooth(curve: Curve, fraction_octave: float = SMOOTHING_OCTAVE) -> Curve:
    """Fractional-octave smoothing on a log grid (boxcar in log-frequency)."""
    per_octave = 1.0 / float(np.median(np.diff(np.log2(curve.freqs_hz))))
    half = max(1, round(per_octave * fraction_octave / 2))
    out = np.full_like(curve.db, np.nan)
    for i in range(len(curve.db)):
        if not np.isfinite(curve.db[i]):
            continue
        window = curve.db[max(0, i - half) : i + half + 1]
        out[i] = float(np.nanmean(window))
    return Curve(freqs_hz=curve.freqs_hz, db=out)


def compensate(curve: Curve, target: Curve) -> Curve:
    """Error curve: measurement minus target, on the same grid."""
    if not np.array_equal(curve.freqs_hz, target.freqs_hz):
        raise FrValidationError("curve and target must share a frequency grid")
    return Curve(freqs_hz=curve.freqs_hz, db=curve.db - target.db)


def band_features(
    curve: Curve, *, compensated_against: str | None = None, rig_family: str | None = None
) -> FrFeatures:
    features = []
    for band in BANDS:
        values = curve.db[band_mask(curve.freqs_hz, band)]
        finite = np.isfinite(values)
        coverage = float(finite.mean()) if values.size else 0.0
        if coverage == 0:
            continue  # Unmeasured band: omit rather than invent a value.
        features.append(
            BandFeature(
                key=band.key,
                mean_db=round(float(np.mean(values[finite])), 3),
                reliability=BAND_RELIABILITY[band.key],
                coverage=round(coverage, 3),
            )
        )
    return FrFeatures(
        bands=features, compensated_against=compensated_against, rig_family=rig_family
    )


def olive_terms(error_r40: npt.NDArray[np.float64]) -> tuple[npt.NDArray[np.float64], ...]:
    """SD, slope and AAE of error curves on :data:`R40_HZ`; last axis is frequency.

    Vectorised so posterior samples can be scored in one call. Frequencies without data
    (NaN) are left out, which is reported as reduced coverage by :func:`olive_inear`.
    """
    f = R40_HZ
    fit = (f >= 20) & (f <= 10_000)
    x = np.log(f[fit])
    y = error_r40[..., fit]
    valid = np.isfinite(y)
    n = valid.sum(axis=-1)
    y0 = np.where(valid, y, 0.0)
    mean_y = y0.sum(axis=-1) / n
    xm = np.where(valid, x, 0.0)
    mean_x = xm.sum(axis=-1) / n
    dx = np.where(valid, x - mean_x[..., None], 0.0)
    dy = np.where(valid, y - mean_y[..., None], 0.0)
    slope = (dx * dy).sum(axis=-1) / (dx * dx).sum(axis=-1)
    sd = np.sqrt((dy * dy).sum(axis=-1) / (n - 1))

    at500 = error_r40[..., int(np.argmin(np.abs(f - NORMALISATION_HZ)))]
    band = (f >= 40) & (f <= 10_000)
    aligned = error_r40[..., band] - at500[..., None]
    aae = np.nanmean(np.abs(aligned), axis=-1)
    return sd, slope, aae


def olive_score(
    sd: npt.ArrayLike, slope: npt.ArrayLike, aae: npt.ArrayLike
) -> npt.NDArray[np.float64]:
    return np.asarray(
        OLIVE_INTERCEPT
        - OLIVE_SD * np.asarray(sd)
        - OLIVE_SLOPE * np.abs(np.asarray(slope))
        - OLIVE_AAE * np.asarray(aae)
    )


def olive_inear(error: Curve) -> OliveStats | None:
    """In-ear predicted preference for one error curve (measurement minus target)."""
    on_r40 = interpolate(error, R40_HZ)
    span = (R40_HZ >= 20) & (R40_HZ <= 10_000)
    coverage = float(np.isfinite(on_r40[span]).mean())
    at500 = on_r40[int(np.argmin(np.abs(R40_HZ - NORMALISATION_HZ)))]
    if coverage < 0.8 or not math.isfinite(float(at500)):
        return None  # too little of the model's range was measured to apply it
    sd, slope, aae = (float(v) for v in olive_terms(on_r40))
    return OliveStats(
        sd_db=round(sd, 3),
        slope_db=round(slope, 3),
        aae_db=round(aae, 3),
        score=round(float(olive_score(sd, slope, aae)), 2),
        coverage=round(coverage, 3),
    )


def process(
    points: Sequence[Sequence[float]],
    *,
    target: Curve | None = None,
    target_name: str | None = None,
    rig_family: str | None = None,
) -> tuple[Curve, FrFeatures]:
    """Run the full pipeline; returns the normalised grid curve and its features.

    ``target`` must be on the common grid (see :func:`to_grid`); it is normalised here.
    Band features are errors against the target when one is given, levels otherwise.
    """
    curve = normalise(to_grid(validate_points(points)))
    if target is None:
        return curve, band_features(smooth(curve), rig_family=rig_family)
    error = compensate(curve, normalise(target))
    features = band_features(smooth(error), compensated_against=target_name, rig_family=rig_family)
    features.olive = olive_inear(error)
    return curve, features
