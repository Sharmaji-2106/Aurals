"""Does the tuning duel find a listener's preference? A simulation, before any claim.

Simulated listeners are drawn from the population prior (each with a true ideal per
tonal dimension), listen through a known device, and answer the adaptive duel with
the choice model's noise — or with more noise than the model assumes, to see how
it degrades. Their profile is then estimated the way the sound profile does it
(population prior × duel evidence) and compared with the truth.

    uv run --no-sync python -m auralis.tuning.simulate
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from statistics import NormalDist

from auralis.tuning.inference import CHOICE_NOISE, Choice, Picked, duel_beliefs
from auralis.tuning.policy import POP_SD, Trial, next_trial, observe, start
from auralis.tuning.shapes import TONAL

_N = NormalDist()


@dataclass(frozen=True, slots=True)
class Result:
    listeners: int
    noise_factor: float
    rmse_prior: dict[str, float]
    rmse_duel: dict[str, float]

    def reduction(self) -> float:
        before = math.sqrt(sum(v**2 for v in self.rmse_prior.values()) / len(TONAL))
        after = math.sqrt(sum(v**2 for v in self.rmse_duel.values()) / len(TONAL))
        return 1 - after / before


def run(listeners: int = 400, noise_factor: float = 1.0, seed: int = 7) -> Result:
    rng = random.Random(seed)  # noqa: S311 - a reproducible simulation, not security
    err_prior = dict.fromkeys(TONAL, 0.0)
    err_duel = dict.fromkeys(TONAL, 0.0)
    for _ in range(listeners):
        truth = {d: rng.gauss(0, POP_SD[d]) for d in TONAL}
        beliefs = start(None)
        history: list[Trial] = []
        records: list[dict[str, object]] = []
        while (trial := next_trial(beliefs, history)) is not None:
            gap = 4 * trial.delta_db * (truth[trial.dimension] - trial.center_db)
            p_plus = _N.cdf(gap / (CHOICE_NOISE * noise_factor))
            picked: Picked = "plus" if rng.random() < p_plus else "minus"
            observe(beliefs, trial, picked)
            history.append(trial)
            records.append(
                {
                    "dimension": trial.dimension,
                    "center_db": trial.center_db,
                    "delta_db": trial.delta_db,
                    "picked": picked,
                    "repeat_of": trial.repeat_of,
                }
            )
        # The profile's way: population prior combined with the duel's evidence.
        duel = duel_beliefs([Choice.parse(r) for r in records])
        for d in TONAL:
            prior_var = POP_SD[d] ** 2
            estimate = 0.0
            if d in duel:
                b = duel[d]
                like_precision = 1 / b.var - 1 / 100.0
                if like_precision > 1e-6:
                    like_mean = (b.mean / b.var) / like_precision
                    precision = 1 / prior_var + like_precision
                    estimate = (like_mean * like_precision) / precision
            err_prior[d] += truth[d] ** 2
            err_duel[d] += (estimate - truth[d]) ** 2
    return Result(
        listeners,
        noise_factor,
        {d: math.sqrt(v / listeners) for d, v in err_prior.items()},
        {d: math.sqrt(v / listeners) for d, v in err_duel.items()},
    )


def main() -> None:
    for factor in (1.0, 2.0):
        r = run(noise_factor=factor)
        print(
            f"listeners={r.listeners} answer noise ×{factor}: error reduced by {r.reduction():.0%}"
        )
        for d in TONAL:
            print(f"  {d:<15} prior {r.rmse_prior[d]:.2f} dB -> duel {r.rmse_duel[d]:.2f} dB")


if __name__ == "__main__":
    main()
