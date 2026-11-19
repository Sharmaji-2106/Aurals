"""Which A/B pair to play next. Mirrored exactly in the browser (`tuning/adaptive.ts`).

The duel keeps a working belief per tonal dimension: the population prior (the
sound profile's own spreads) combined with the shape the listener picked. Each
trial goes to the dimension it is relatively least sure about, centred on the
current estimate, with a step that shrinks as the belief tightens — a coarse
search first, then fine. One early trial is repeated unannounced to measure the
listener's consistency (see :mod:`auralis.tuning.inference`).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from auralis.tuning.inference import CHOICE_NOISE, SHAPE_SD, Belief, Picked, probit_update
from auralis.tuning.shapes import BY_KEY, TONAL

#: Population spread per dimension, dB (the sound profile's prior assumptions).
POP_SD: Final = {
    "sub_bass": 3.0,
    "mid_bass": 3.0,
    "warmth": 1.5,
    "vocal_presence": 1.5,
    "treble": 2.5,
    "air": 2.5,
}
#: Where to look first when uncertainty is level: the regions preference varies most.
PRIORITY: Final = ("sub_bass", "treble", "vocal_presence", "warmth", "air", "mid_bass")
TRIALS: Final = 8
REPEAT_AT: Final = 5
REPEAT_OF: Final = 1
MIN_STEP: Final = 1.5
MAX_STEP: Final = 4.0


@dataclass(frozen=True, slots=True)
class Trial:
    dimension: str
    center_db: float
    delta_db: float
    repeat_of: int | None = None


def start(shape: str | None) -> dict[str, Belief]:
    picked = BY_KEY.get(shape or "")
    beliefs = {}
    for d in TONAL:
        prior = POP_SD[d] ** 2
        if picked is None:
            beliefs[d] = Belief(0.0, prior)
        else:
            shape_var = SHAPE_SD**2
            precision = 1 / prior + 1 / shape_var
            beliefs[d] = Belief((picked.offsets[d] / shape_var) / precision, 1 / precision)
    return beliefs


def next_trial(beliefs: dict[str, Belief], history: list[Trial]) -> Trial | None:
    n = len(history)
    if n >= TRIALS:
        return None
    if n == REPEAT_AT and n > REPEAT_OF:
        first = history[REPEAT_OF]
        return Trial(first.dimension, first.center_db, first.delta_db, repeat_of=REPEAT_OF)
    tested = [t.dimension for t in history]

    # Relative uncertainty, with a small nudge against testing the same region twice running.
    def score(d: str) -> float:
        rel = beliefs[d].var / POP_SD[d] ** 2
        if tested and tested[-1] == d:
            rel *= 0.6
        return rel - PRIORITY.index(d) * 1e-3

    dim = max(TONAL, key=score)
    b = beliefs[dim]
    step = min(MAX_STEP, max(MIN_STEP, 1.6 * b.var**0.5))
    return Trial(dim, round(b.mean, 1), round(step * 2) / 2)


def observe(beliefs: dict[str, Belief], trial: Trial, picked: Picked) -> None:
    beliefs[trial.dimension] = probit_update(
        beliefs[trial.dimension], trial.center_db, trial.delta_db, picked, CHOICE_NOISE
    )
