"""Hearing an earphone's tuning on your own music: the curve the browser applies.

What this is, said as plainly as the UI says it:

- The browser re-shapes a song with ``gain_db`` (a linear-phase filter built from
  it, level-matched, so a louder version never wins on loudness).
- ``gain_db`` is the earphone's measured response **minus a baseline**: the
  listener's own earphones when those are measured on the same rig (then what they
  hear approximates swapping one for the other), otherwise the reference target
  (then it is the earphone's tuning *relative to neutral*, still heard through
  whatever they are wearing).
- It is a frequency response and nothing else. Fit, seal, distortion, imaging and
  the listener's own ear canal are not in it, and the response above ~8 kHz says
  less about any one listener's ears than below — so the curve is smoothed more
  there and its swings are softened. Both are stated in ``notes``.

Only earphones measured on the reference rig, or converted into it, have a curve;
nothing is invented for the rest.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
import numpy.typing as npt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auralis.acoustics import fr
from auralis.recommend.base import Candidate
from auralis.recommend.service import load_candidates, load_target

#: Where the swings start to be softened, and how much is left of them at 16 kHz.
SOFTEN_FROM_HZ = 8_000.0
SOFTEN_AT_16K = 0.5
#: No filter boosts or cuts beyond this: past it a measurement artefact would be
#: louder than any tuning.
LIMIT_DB = 12.0


class ListenCurve(BaseModel):
    slug: str
    label: str
    brand: str
    model: str
    image_path: str | None
    freqs_hz: list[float]
    #: Apply this to the music (dB). Zero-mean through the midrange; level is matched
    #: in the browser anyway.
    gain_db: list[float]
    baseline: Literal["device", "target"]
    baseline_label: str
    measured_by: str
    rig: str | None
    converted: bool
    notes: list[str]


def _filled(db: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    """Unmeasured ends held at the nearest measured value (then faded out by the caller)."""
    out = db.copy()
    known = np.flatnonzero(np.isfinite(out))
    if known.size == 0:
        return np.zeros_like(out)
    out[: known[0]] = out[known[0]]
    out[known[-1] + 1 :] = out[known[-1]]
    gaps = ~np.isfinite(out)
    if gaps.any():
        idx = np.arange(out.size)
        out[gaps] = np.interp(idx[gaps], idx[~gaps], out[~gaps])
    return out


def _smooth(freqs: npt.NDArray[np.float64], db: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    """Fractional-octave smoothing: 1/6 octave through the mids, 1/3 above 6 kHz."""
    octave = np.log2(freqs)
    width = np.interp(freqs, [1_000.0, 6_000.0], [1 / 6, 1 / 3])
    out = np.empty_like(db)
    for i, (o, w) in enumerate(zip(octave, width, strict=True)):
        weights = np.exp(-0.5 * ((octave - o) / (w / 2)) ** 2)
        out[i] = float(np.sum(weights * db) / np.sum(weights))
    return out


def listening_gain(
    freqs: npt.NDArray[np.float64],
    measured: npt.NDArray[np.float64],
    baseline: npt.NDArray[np.float64],
) -> npt.NDArray[np.float64]:
    """What to apply to music so it takes on ``measured`` instead of ``baseline``."""
    delta = _filled(measured) - _filled(baseline)
    delta = _smooth(freqs, delta)
    mids = (freqs >= 300) & (freqs <= 2_000)
    delta -= float(np.median(delta[mids])) if mids.any() else 0.0
    soften = np.interp(
        np.log2(freqs), [np.log2(SOFTEN_FROM_HZ), np.log2(16_000.0)], [1.0, SOFTEN_AT_16K]
    )
    delta *= soften
    # Nothing below 20 Hz or above 20 kHz is asked of the filter.
    delta *= np.interp(freqs, [15.0, 25.0], [0.0, 1.0]) * np.interp(
        freqs, [18_000.0, 20_000.0], [1.0, 0.0]
    )
    return np.clip(delta, -LIMIT_DB, LIMIT_DB)


def _label(c: Candidate) -> str:
    return f"{c.brand} {c.model}"


def listen_curve(db: Session, slug: str, *, against: str | None) -> ListenCurve | None:
    """The curve for ``slug``; ``against`` is a device slug, or None for the target."""
    target = load_target(db)
    if target is None:
        return None
    candidates = {c.slug: c for c in load_candidates(db, target.rig_family)}
    found = candidates.get(slug)
    if found is None:
        return None
    at = fr.R40_HZ
    measured = fr.interpolate(fr.Curve(found.freqs_hz, found.response_db), at)
    device = candidates.get(against) if against and against != slug else None
    if device is not None:
        base = fr.interpolate(fr.Curve(device.freqs_hz, device.response_db), at)
        baseline: Literal["device", "target"] = "device"
        baseline_label = _label(device)
    else:
        base = fr.interpolate(fr.Curve(target.freqs_hz, target.db), at)
        baseline = "target"
        baseline_label = "the reference target"
    gain = listening_gain(at, measured, base)

    converted = found.measurement.converted_to is not None
    notes = []
    if baseline == "device":
        notes.append(
            f"Shaped against your {baseline_label}, measured on the same rig: what you hear "
            f"approximates swapping them."
        )
    else:
        notes.append(
            "Shaped against the reference target, not your own earphones: you hear this "
            "tuning's difference from neutral, through whatever you are wearing."
        )
    if converted:
        notes.append(
            "Measured on a clone coupler and converted to the reference rig, so it is an "
            "estimate of an estimate."
        )
    notes.append(
        "Above 8 kHz a measurement says less about your own ears, so the curve is smoothed "
        "more there and its peaks are softened."
    )
    notes.append("Frequency response only: fit, seal, distortion and imaging are not in it.")
    return ListenCurve(
        slug=found.slug,
        label=_label(found),
        brand=found.brand,
        model=found.model,
        image_path=found.image.path if found.image else None,
        freqs_hz=at.round(1).tolist(),
        gain_db=gain.round(2).tolist(),
        baseline=baseline,
        baseline_label=baseline_label,
        measured_by=found.measurement.source,
        rig=found.measurement.rig,
        converted=converted,
        notes=notes,
    )
