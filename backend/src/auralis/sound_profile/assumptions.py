"""Every numeric assumption of the personal sound-profile model, in one place.

Each parameter says what it is, where its value comes from and how sure that source
is. The evaluation (``auralis evaluate``) sweeps the listed ``sweep`` values to show
how much the recommendations depend on each one. When listener feedback exists, these
are the quantities a fitted model would estimate instead.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Final, Literal

from pydantic import BaseModel

Status = Literal["literature", "literature_informed", "assumption", "hypothesis"]


@dataclass(frozen=True, slots=True)
class Assumption:
    key: str
    value: float
    unit: str
    status: Status
    basis: str
    sweep: tuple[float, ...]


class AssumptionOut(BaseModel):
    key: str
    value: float
    unit: str
    status: Status
    basis: str


PRIOR_SD_BASS: Final = Assumption(
    "prior_sd_bass_db",
    3.0,
    "dB",
    "literature_informed",
    "Harman listener classes: 64% prefer the target, 15% want 4-6 dB more bass, 21% about "
    "2 dB less (Olive 2022). That mixture alone has an SD of about 2.1 dB; within-class "
    "spread is added.",
    (2.0, 3.0, 4.0),
)
PRIOR_SD_TREBLE: Final = Assumption(
    "prior_sd_treble_db",
    2.5,
    "dB",
    "literature_informed",
    "Demographic groups differ by about 2 dB in preferred treble (Olive & Welti 2015).",
    (1.5, 2.5, 3.5),
)
PRIOR_SD_MIDS: Final = Assumption(
    "prior_sd_mids_db",
    1.5,
    "dB",
    "assumption",
    "Listeners strongly rejected both the 2-4 kHz emphasis of diffuse-field targets and too "
    "little energy there (Olive et al. 2013); variation in the midrange is assumed smaller "
    "than in bass.",
    (1.0, 1.5, 2.5),
)
PRIOR_SD_AIR: Final = Assumption(
    "prior_sd_air_db",
    2.5,
    "dB",
    "assumption",
    "No preference data; set like treble. Couplers are unreliable above 10 kHz anyway.",
    (1.5, 2.5, 3.5),
)
ANSWER_RELIABILITY: Final = Assumption(
    "answer_reliability",
    0.70,
    "0-1",
    "literature_informed",
    "Conservative minimum reliability of single-item self-report measures (Wanous, Reichers "
    "& Hudy 1997). Borrowed from a neighbouring field, not measured for audio questions.",
    (0.5, 0.7, 0.9),
)
INDIRECT_FACTOR: Final = Assumption(
    "indirect_reliability_factor",
    0.5,
    "x",
    "assumption",
    "An answer inferred from a neighbouring question (e.g. air from treble) keeps half the "
    "reliability of a direct one.",
    (0.25, 0.5, 0.75),
)
MUSIC_CORRELATION: Final = Assumption(
    "music_correlation",
    round(math.sqrt(ANSWER_RELIABILITY.value), 3),
    "rho",
    "hypothesis",
    "Correlation between a library's spectral balance and the listener's preferred balance. "
    "No study has measured it (research.md section 3). The sign follows the "
    "content-matching hypothesis; the magnitude makes a large library exactly as "
    "informative as one direct answer (rho^2 = answer reliability).",
    (-0.837, 0.0, 0.5, 0.837, 0.95),
)

ALL: Final[tuple[Assumption, ...]] = (
    PRIOR_SD_BASS,
    PRIOR_SD_TREBLE,
    PRIOR_SD_MIDS,
    PRIOR_SD_AIR,
    ANSWER_RELIABILITY,
    INDIRECT_FACTOR,
    MUSIC_CORRELATION,
)


@dataclass(frozen=True, slots=True)
class ModelParameters:
    """The values the model runs with; defaults are the documented assumptions."""

    sd_bass_db: float = PRIOR_SD_BASS.value
    sd_treble_db: float = PRIOR_SD_TREBLE.value
    sd_mids_db: float = PRIOR_SD_MIDS.value
    sd_air_db: float = PRIOR_SD_AIR.value
    answer_reliability: float = ANSWER_RELIABILITY.value
    indirect_factor: float = INDIRECT_FACTOR.value
    music_correlation: float = MUSIC_CORRELATION.value

    def with_(self, **changes: float) -> ModelParameters:
        return replace(self, **changes)

    def describe(self) -> list[AssumptionOut]:
        values = {
            PRIOR_SD_BASS.key: self.sd_bass_db,
            PRIOR_SD_TREBLE.key: self.sd_treble_db,
            PRIOR_SD_MIDS.key: self.sd_mids_db,
            PRIOR_SD_AIR.key: self.sd_air_db,
            ANSWER_RELIABILITY.key: self.answer_reliability,
            INDIRECT_FACTOR.key: self.indirect_factor,
            MUSIC_CORRELATION.key: self.music_correlation,
        }
        return [
            AssumptionOut(
                key=a.key, value=values[a.key], unit=a.unit, status=a.status, basis=a.basis
            )
            for a in ALL
        ]


DEFAULT: Final = ModelParameters()
