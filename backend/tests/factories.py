"""Synthetic test data. Clearly fake; never used outside tests."""

from __future__ import annotations

import numpy as np

from auralis.acoustics.bands import BAND_KEYS, log_grid
from auralis.analysis.features import Spread, TrackFeatures

# Roughly the calibration corpus medians, so default tracks read as "typical".
TYPICAL_BANDS = {
    "sub_bass": 0.0,
    "mid_bass": 3.4,
    "lower_mids": 0.9,
    "mids": 0.9,
    "upper_mids": -2.8,
    "presence": -6.4,
    "lower_treble": -8.2,
    "upper_treble": -11.4,
    "air": -20.7,
}


def make_features(
    rng: np.random.Generator | None = None,
    *,
    jitter: float = 0.0,
    band_offsets: dict[str, float] | None = None,
    **overrides: object,
) -> TrackFeatures:
    rng = rng or np.random.default_rng(0)

    def j(scale: float) -> float:
        return float(rng.normal(0, scale * jitter)) if jitter else 0.0

    bands = {k: TYPICAL_BANDS[k] + (band_offsets or {}).get(k, 0.0) + j(2.0) for k in BAND_KEYS}
    freqs = log_grid(6, 20, 20_000 / 1.06)
    values: dict[str, object] = {
        "analysed_seconds": 200.0 + j(30),
        "sample_rate": 44_100,
        "source_codec": "opus",
        "source_sample_rate": 48_000,
        "truncated": False,
        "effective_bandwidth_hz": 20_000.0,
        "integrated_lufs": -9.9 + j(3),
        "loudness_range_lu": 5.6 + j(2),
        "sample_peak_dbfs": 0.5,
        "peak_to_loudness_db": 11.1 + j(2),
        "band_levels_db": bands,
        "spectrum_freqs_hz": [round(float(f), 2) for f in freqs],
        "spectrum_db": [round(float(-3 * np.log2(f / 1000) + j(1)), 2) for f in freqs],
        "centroid_hz": Spread(p10=1500, median=2860 * 2 ** j(0.4), p90=5000),
        "rolloff_hz": 8000.0,
        "flatness": 0.0014,
        "side_to_mid_db": -8.1 + j(3),
        "tempo_bpm": 120.0,
        "onset_rate_hz": 3.3 + j(0.8),
        "percussive_ratio": min(0.9, max(0.05, 0.28 + j(0.1))),
        "mfcc_mean": [float(v) for v in rng.normal(0, 10 * max(jitter, 0.01), 20)],
        "mfcc_std": [5.0] * 20,
    }
    values.update(overrides)
    return TrackFeatures.model_validate(values)
