"""What a listening session says about a listener's preferred sound.

Two kinds of listening evidence, both on the six tonal dimensions, in dB relative
to the Harman in-ear 2019 target (the sound profile's unit):

**The tuning duel** (A/B). Each trial plays one clip in two tunings that differ on
one dimension only: the current estimate μ moved up by Δ ("plus") or down by Δ
("minus"), loudness-matched, in random order. Preference is modelled as a utility
that falls off with distance from the listener's ideal θ, ``U(x) = −(x − θ)²``, and
each choice as a noisy comparison of utilities (Thurstone/probit):

    P(plus | θ) = Φ( (U(μ+Δ) − U(μ−Δ)) / σc ) = Φ( 4Δ(θ − μ) / σc )

Every choice updates a Gaussian belief about θ by assumed-density filtering (the
closed-form probit update used in TrueSkill-style rating). "Can't tell" says the
ideal lies close to μ and is read as a Gaussian observation of width ~Δ.
The belief, started vague, is turned back into a likelihood, so the sound profile
can weigh it against music and answers by precision — nothing about the balance is
fixed.

**The shape pick** — "which of these sounds like you" — is a single, coarse
self-identification: one wide Gaussian observation at the shape's offsets.

**The listener's own device.** Both are heard *through what they are wearing*, so a
choice reveals the change they prefer to that device, not an absolute level. When
the device is known and measured, its deviation from the target is added back
(``θ = device + preferred change``); when it is not, the evidence is widened.

**Consistency.** One trial is repeated unannounced. A listener who answers it the
same way gets a narrower choice noise σc; one who doesn't, a wider one. So careful
listening counts for more — per person, from their own behaviour.

All constants are assumptions, stated here and labelled heuristic.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from statistics import NormalDist
from typing import Any, Final, Literal

from auralis.tuning.shapes import BY_KEY, TONAL

_N: Final = NormalDist()

#: Choice noise σc in utility units (dB²). With Δ = 2 dB, a listener whose ideal is
#: 1 dB above μ picks "plus" ~84 % of the time. Heuristic; swept in the evaluation.
CHOICE_NOISE: Final = 8.0
#: Vague starting belief for the duel, so its result is almost purely the choices.
VAGUE_SD: Final = 10.0
#: Width of the shape pick as evidence: a nudge, not a verdict (heuristic).
SHAPE_SD: Final = 3.0
#: Extra spread when the listening device is unknown (heuristic: typical spread of
#: consumer earphones around the target in each region).
DEVICE_UNKNOWN_SD: Final = 2.5
#: "Can't tell" places the ideal within about this many steps of μ (heuristic).
SAME_WIDTH: Final = 0.75
#: How the repeated trial scales the choice noise (heuristic).
CONSISTENT_FACTOR: Final = 0.8
INCONSISTENT_FACTOR: Final = 1.8

Picked = Literal["plus", "minus", "same"]
Consistency = Literal["consistent", "mixed", "untested"]


@dataclass(frozen=True, slots=True)
class Choice:
    dimension: str
    center_db: float
    delta_db: float
    picked: Picked
    repeat_of: int | None = None

    @classmethod
    def parse(cls, raw: Mapping[str, Any]) -> Choice:
        return cls(
            dimension=str(raw["dimension"]),
            center_db=float(raw["center_db"]),
            delta_db=float(raw["delta_db"]),
            picked=raw["picked"],
            repeat_of=raw.get("repeat_of"),
        )


@dataclass(frozen=True, slots=True)
class Belief:
    mean: float
    var: float


@dataclass(frozen=True, slots=True)
class ListeningObservation:
    dimension: str
    value: float
    variance: float
    note: str


def probit_update(b: Belief, center: float, delta: float, picked: Picked, noise: float) -> Belief:
    """One A/B choice, folded into a Gaussian belief about the ideal θ."""
    if picked == "same":
        v = (SAME_WIDTH * delta) ** 2
        precision = 1 / b.var + 1 / v
        return Belief((b.mean / b.var + center / v) / precision, 1 / precision)
    y = 1.0 if picked == "plus" else -1.0
    a = 4 * delta / noise
    denom = math.sqrt(1 + a * a * b.var)
    z = y * a * (b.mean - center) / denom
    cdf = max(_N.cdf(z), 1e-12)
    lam = _N.pdf(z) / cdf
    mean = b.mean + y * a * b.var * lam / denom
    var = b.var * (1 - a * a * b.var * lam * (lam + z) / (1 + a * a * b.var))
    return Belief(mean, max(var, 1e-6))


def consistency(choices: Sequence[Choice]) -> tuple[Consistency, float]:
    """How the listener answered their repeated trials, and the noise factor it implies."""
    checks = [
        choices[c.repeat_of].picked == c.picked
        for c in choices
        if c.repeat_of is not None and 0 <= c.repeat_of < len(choices)
    ]
    if not checks:
        return "untested", 1.0
    factor = math.prod(CONSISTENT_FACTOR if ok else INCONSISTENT_FACTOR for ok in checks)
    return ("consistent" if all(checks) else "mixed"), factor


def duel_beliefs(choices: Sequence[Choice], noise: float = CHOICE_NOISE) -> dict[str, Belief]:
    """The duel alone: a belief per dimension that was tested, from a vague start."""
    _, factor = consistency(choices)
    sigma_c = noise * factor
    beliefs: dict[str, Belief] = {}
    for c in choices:
        if c.dimension not in TONAL or c.delta_db <= 0:
            continue
        b = beliefs.get(c.dimension, Belief(0.0, VAGUE_SD**2))
        beliefs[c.dimension] = probit_update(b, c.center_db, c.delta_db, c.picked, sigma_c)
    return beliefs


def _as_likelihood(b: Belief) -> Belief | None:
    """Divide the vague start back out, leaving what the choices alone say."""
    precision = 1 / b.var - 1 / VAGUE_SD**2
    if precision <= 1e-6:
        return None
    return Belief((b.mean / b.var) / precision, 1 / precision)


def observations(
    *,
    shape: str | None,
    choices: Sequence[Mapping[str, Any]],
    device_offsets: Mapping[str, float] | None,
    device_label: str | None = None,
) -> dict[str, list[ListeningObservation]]:
    """The session as observations for the sound profile, per tonal dimension."""
    parsed = [Choice.parse(c) for c in choices]
    counts: dict[str, int] = {}
    for c in parsed:
        counts[c.dimension] = counts.get(c.dimension, 0) + 1
    known = device_offsets is not None
    extra = 0.0 if known else DEVICE_UNKNOWN_SD**2
    on = f" on your {device_label}" if known and device_label else ""
    out: dict[str, list[ListeningObservation]] = {}

    for dim, belief in duel_beliefs(parsed).items():
        like = _as_likelihood(belief)
        if like is None:
            continue
        offset = (device_offsets or {}).get(dim, 0.0)
        n = counts.get(dim, 0)
        out.setdefault(dim, []).append(
            ListeningObservation(
                dim,
                like.mean + offset,
                like.var + extra,
                f"From {n} listening comparison{'s' if n != 1 else ''}{on}",
            )
        )

    picked = BY_KEY.get(shape or "")
    if picked is not None:
        for dim in TONAL:
            offset = (device_offsets or {}).get(dim, 0.0)
            out.setdefault(dim, []).append(
                ListeningObservation(
                    dim,
                    picked.offsets[dim] + offset,
                    SHAPE_SD**2 + extra,
                    f"From the shape you picked ({picked.label})",
                )
            )
    return out
