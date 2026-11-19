"""Canonical frequency bands.

The band edges follow common audio-engineering / IEM-community usage. They are a
*convention*, not a standard: there is no universally agreed boundary between, say,
"upper mids" and "presence". What matters is that every part of Auralis uses the
same edges. Changing them is a breaking change for stored profiles, which is why
the set is versioned.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

import numpy as np
import numpy.typing as npt

BANDS_VERSION: Final = "bands/1"

BandKey = Literal[
    "sub_bass",
    "mid_bass",
    "lower_mids",
    "mids",
    "upper_mids",
    "presence",
    "lower_treble",
    "upper_treble",
    "air",
]


@dataclass(frozen=True, slots=True)
class Band:
    key: BandKey
    label: str
    low_hz: float
    high_hz: float

    @property
    def octaves(self) -> float:
        return float(np.log2(self.high_hz / self.low_hz))

    @property
    def center_hz(self) -> float:
        return float(np.sqrt(self.low_hz * self.high_hz))


BANDS: Final[tuple[Band, ...]] = (
    Band("sub_bass", "Sub-bass", 20, 60),
    Band("mid_bass", "Mid-bass", 60, 200),
    Band("lower_mids", "Lower mids", 200, 500),
    Band("mids", "Mids", 500, 1200),
    Band("upper_mids", "Upper mids", 1200, 3000),
    Band("presence", "Presence", 3000, 5000),
    Band("lower_treble", "Lower treble", 5000, 8000),
    Band("upper_treble", "Upper treble", 8000, 12000),
    Band("air", "Air", 12000, 20000),
)
BAND_KEYS: Final[tuple[BandKey, ...]] = tuple(b.key for b in BANDS)
BANDS_BY_KEY: Final[dict[BandKey, Band]] = {b.key: b for b in BANDS}

MIN_HZ: Final = BANDS[0].low_hz
MAX_HZ: Final = BANDS[-1].high_hz


def log_grid(
    points_per_octave: int, low_hz: float = MIN_HZ, high_hz: float = MAX_HZ
) -> npt.NDArray[np.float64]:
    """Log-spaced frequency grid, inclusive of both ends."""
    n_oct = np.log2(high_hz / low_hz)
    n = round(float(n_oct) * points_per_octave) + 1
    return np.asarray(low_hz * 2.0 ** (np.arange(n) / points_per_octave), dtype=np.float64)


def band_mask(freqs: npt.NDArray[np.floating], band: Band) -> npt.NDArray[np.bool_]:
    """Half-open [low, high) membership; the top band also includes its upper edge."""
    upper = freqs <= band.high_hz if band is BANDS[-1] else freqs < band.high_hz
    return np.asarray((freqs >= band.low_hz) & upper)
