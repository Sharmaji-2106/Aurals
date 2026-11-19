"""Per-track descriptors: the *heuristic* layer.

Descriptors turn measured features into 0-1 scores such as "warmth" or "energy". Each
score is a logistic of a robust z-score against a reference corpus (see
``calibration.json``), so 0.5 means "typical for the corpus" and ~0.73 means one
robust standard deviation above it.

None of these are validated perceptual models. They are transparent, reproducible
summaries designed to be replaced by learned models later; that's why every stored
descriptor carries :data:`DESCRIPTORS_VERSION` and the calibration id, and why the
raw features are always stored next to them.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from typing import Final, Literal

from pydantic import BaseModel, Field

from auralis.acoustics.bands import BAND_KEYS, BandKey
from auralis.analysis.features import TrackFeatures
from auralis.analysis.version import DESCRIPTORS_VERSION

DescriptorKey = Literal["brightness", "warmth", "energy", "dynamics", "density", "width"]
DESCRIPTOR_KEYS: Final[tuple[DescriptorKey, ...]] = (
    "brightness",
    "warmth",
    "energy",
    "dynamics",
    "density",
    "width",
)


def _band_metric(key: BandKey) -> Callable[[TrackFeatures], float]:
    return lambda f: f.band_levels_db[key]


# Raw scalar metrics the calibration corpus is summarised on.
RAW_METRICS: Final[dict[str, Callable[[TrackFeatures], float]]] = {
    **{f"band:{k}": _band_metric(k) for k in BAND_KEYS},
    "log2_centroid": lambda f: math.log2(max(f.centroid_hz.median, 1.0)),
    "tilt_db": lambda f: (
        (
            (f.band_levels_db["mid_bass"] + f.band_levels_db["lower_mids"])
            - (f.band_levels_db["upper_mids"] + f.band_levels_db["presence"])
        )
        / 2
    ),
    "onset_rate_hz": lambda f: f.onset_rate_hz,
    "percussive_ratio": lambda f: f.percussive_ratio,
    "integrated_lufs": lambda f: f.integrated_lufs,
    "loudness_range_lu": lambda f: f.loudness_range_lu,
    "peak_to_loudness_db": lambda f: f.peak_to_loudness_db,
    "side_to_mid_db": lambda f: f.side_to_mid_db,
    "log10_flatness": lambda f: math.log10(max(f.flatness, 1e-6)),
}


@dataclass(frozen=True, slots=True)
class DescriptorSpec:
    label: str
    summary: str
    inputs: tuple[str, ...]


DESCRIPTOR_SPECS: Final[dict[DescriptorKey, DescriptorSpec]] = {
    "brightness": DescriptorSpec(
        "Brightness",
        "Where the spectral centre of gravity sits, relative to the reference corpus.",
        ("log2_centroid",),
    ),
    "warmth": DescriptorSpec(
        "Warmth",
        "Energy in bass and lower mids relative to upper mids and presence.",
        ("tilt_db",),
    ),
    "energy": DescriptorSpec(
        "Energy",
        "A blend of transient rate, percussive share and loudness.",
        ("onset_rate_hz", "percussive_ratio", "integrated_lufs"),
    ),
    "dynamics": DescriptorSpec(
        "Dynamics",
        "How much loudness varies over time and how much headroom peaks have.",
        ("loudness_range_lu", "peak_to_loudness_db"),
    ),
    "density": DescriptorSpec(
        "Density",
        "How busy the music is: transient rate and how noise-like the spectrum is.",
        ("onset_rate_hz", "log10_flatness"),
    ),
    "width": DescriptorSpec(
        "Stereo width",
        "Energy in the side channel relative to the centre of the mix.",
        ("side_to_mid_db",),
    ),
}


class Calibration(BaseModel):
    id: str
    description: str
    track_count: int
    metrics: dict[str, tuple[float, float]] = Field(
        description="metric -> (center, scale) where scale is a robust standard deviation"
    )


@lru_cache
def load_calibration() -> Calibration:
    raw = resources.files("auralis.analysis").joinpath("calibration.json").read_text("utf-8")
    return Calibration.model_validate(json.loads(raw))


class TrackDescriptors(BaseModel):
    version: str = DESCRIPTORS_VERSION
    calibration: str
    band_emphasis: dict[BandKey, float]
    values: dict[DescriptorKey, float]


def _logistic(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))


def raw_metrics(features: TrackFeatures) -> dict[str, float]:
    return {name: float(fn(features)) for name, fn in RAW_METRICS.items()}


def robust_z(features: TrackFeatures, calibration: Calibration | None = None) -> dict[str, float]:
    """Each raw metric as a robust z-score against the reference corpus (derived)."""
    cal = calibration or load_calibration()
    return {
        name: (value - cal.metrics[name][0]) / cal.metrics[name][1]
        for name, value in raw_metrics(features).items()
    }


def descriptor_z(
    features: TrackFeatures, calibration: Calibration | None = None
) -> dict[str, float]:
    """The z-scores behind each descriptor (mean over its inputs), before the logistic."""
    z = robust_z(features, calibration)
    return {
        key: sum(z[m] for m in spec.inputs) / len(spec.inputs)
        for key, spec in DESCRIPTOR_SPECS.items()
    }


def describe(features: TrackFeatures, calibration: Calibration | None = None) -> TrackDescriptors:
    cal = calibration or load_calibration()
    raw = raw_metrics(features)

    def score(metric: str) -> float:
        center, scale = cal.metrics[metric]
        return _logistic((raw[metric] - center) / scale)

    values = {
        key: round(sum(score(m) for m in spec.inputs) / len(spec.inputs), 4)
        for key, spec in DESCRIPTOR_SPECS.items()
    }
    emphasis = {k: round(score(f"band:{k}"), 4) for k in BAND_KEYS}
    return TrackDescriptors(calibration=cal.id, band_emphasis=emphasis, values=values)
