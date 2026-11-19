"""A simpler comparator: rank by reliability-weighted RMS band error (``band-rms/1``).

Same inputs, target and explanations as :mod:`auralis.recommend.harman`; only the
ranking differs. It ignores the tilt and smoothness terms of the Olive et al. model and
weights each band by the measurement reliability of the rig there. It
exists so the evaluation can show how much the choice of scoring model matters.
"""

from __future__ import annotations

import numpy as np

from auralis.acoustics import fr
from auralis.acoustics.bands import BANDS, band_mask
from auralis.recommend.harman import HarmanPersonalRecommender, _Scored


class BandRmsRecommender(HarmanPersonalRecommender):
    version = "band-rms/1"

    def rank_key(self, s: _Scored) -> float:
        total = weight_sum = 0.0
        for band in BANDS:
            values = s.error_mean[band_mask(fr.R40_HZ, band)]
            values = values[np.isfinite(values)]
            if not values.size:
                continue
            weight = fr.BAND_RELIABILITY[band.key]
            total += weight * float(np.mean(values)) ** 2
            weight_sum += weight
        return (total / weight_sum) ** 0.5 if weight_sum else float("inf")
