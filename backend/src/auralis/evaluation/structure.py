"""How do measured IEM tunings actually vary? (PCA of error curves.)

This answers a design question with data instead of assumption: if a few smooth
components (a bass shelf, a tilt, an ear-gain region) explain most of the variation,
then a low-dimensional personal target, as Harman's research suggests, is enough to
tell IEMs apart, and learning a high-dimensional representation is not justified.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from pydantic import BaseModel

from auralis.acoustics import fr
from auralis.recommend.base import Candidate, Target


class Component(BaseModel):
    index: int
    variance_explained: float
    peak_hz: float
    shape: str
    correlation_with_bass_shelf: float
    correlation_with_tilt: float


class Structure(BaseModel):
    iems: int
    components: list[Component]
    cumulative: list[float]


def _band(freqs: np.ndarray) -> np.ndarray:
    return (freqs >= 20) & (freqs <= 10_000)


def pca(candidates: list[Candidate], target: Target, k: int = 5) -> Structure:
    f = fr.R40_HZ[_band(fr.R40_HZ)]
    reference = fr.interpolate(fr.Curve(target.freqs_hz, target.db), f)
    rows = []
    for c in candidates:
        error = fr.interpolate(fr.Curve(c.freqs_hz, c.response_db), f) - reference
        if np.all(np.isfinite(error)):
            rows.append(error)
    x = np.array(rows)
    x = x - x.mean(axis=0)
    _, s, vt = np.linalg.svd(x, full_matrices=False)
    variance = s**2 / np.sum(s**2)
    shelf = 1 / (1 + (f / 105) ** 2)
    tilt = np.log2(f / 1000)
    components = []
    for i in range(min(k, len(variance))):
        v = vt[i] * np.sign(vt[i][np.argmax(np.abs(vt[i]))])
        peak = float(f[int(np.argmax(np.abs(v)))])
        corr_shelf = float(np.corrcoef(v, shelf)[0, 1])
        corr_tilt = float(np.corrcoef(v, tilt)[0, 1])
        shape = (
            "bass shelf"
            if abs(corr_shelf) > 0.8
            else "broad tilt"
            if abs(corr_tilt) > 0.8
            else f"localised, peaking near {peak / 1000:.1f} kHz"
            if peak >= 1000
            else f"localised, peaking near {peak:.0f} Hz"
        )
        components.append(
            Component(
                index=i + 1,
                variance_explained=round(float(variance[i]), 3),
                peak_hz=round(peak, 1),
                shape=shape,
                correlation_with_bass_shelf=round(corr_shelf, 2),
                correlation_with_tilt=round(corr_tilt, 2),
            )
        )
    return Structure(
        iems=len(rows),
        components=components,
        cumulative=[round(float(v), 3) for v in np.cumsum(variance[:k])],
    )


class ImplementationCheck(BaseModel):
    compared: int
    score_r: float
    score_mae: float
    sd_mae: float
    slope_mae: float
    aae_mae: float
    reference: str


RANKING = re.compile(
    r"\| \[(.+?)\]\(\./oratory1990/in-ear/.+?\)\s*\|\s*([-\d.]+)\s*\|\s*([-\d.]+)\s*\|"
    r"\s*([-\d.]+)\s*\|\s*([-\d.]+)"
)


def implementation_check(
    candidates: list[Candidate], target: Target, ranking_md: Path
) -> ImplementationCheck | None:
    """Compare our Olive statistics with AutoEq's published in-ear ranking (same data,
    independent implementation). None when the ranking file isn't cached locally."""
    if not ranking_md.exists():
        return None
    published: dict[str, tuple[float, ...]] = {}
    in_ear = False
    for line in ranking_md.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_ear = "In-ear" in line
        match = RANKING.match(line)
        if match and in_ear:
            published[match.group(1)] = tuple(float(v) for v in match.groups()[1:])
    ours: dict[str, tuple[float, ...]] = {}
    for c in candidates:
        name = f"{c.brand} {c.model}" + (
            f" ({c.measurement.variant})" if c.measurement.variant else ""
        )
        stats = fr.olive_inear(
            fr.compensate(fr.Curve(c.freqs_hz, c.response_db), fr.Curve(c.freqs_hz, target.db))
        )
        if stats is not None:
            ours[name] = (stats.score, stats.sd_db, stats.slope_db, stats.aae_db)
    common = sorted(set(ours) & set(published))
    if not common:
        return None
    a = np.array([ours[n] for n in common])
    b = np.array([published[n] for n in common])
    return ImplementationCheck(
        compared=len(common),
        score_r=round(float(np.corrcoef(a[:, 0], b[:, 0])[0, 1]), 4),
        score_mae=round(float(np.mean(np.abs(a[:, 0] - b[:, 0]))), 3),
        sd_mae=round(float(np.mean(np.abs(a[:, 1] - b[:, 1]))), 3),
        slope_mae=round(float(np.mean(np.abs(a[:, 2] - b[:, 2]))), 3),
        aae_mae=round(float(np.mean(np.abs(a[:, 3] - b[:, 3]))), 3),
        reference="AutoEq results/RANKING.md at the pinned commit (scores rounded to integers)",
    )
