"""Bringing in-ears measured on clone couplers into the ranking (derived, with its error).

The reference target is defined on an IEC 60318-4 coupler, so a response measured on
a "711 clone" coupler (Super Review, Hi End Portable) is not directly comparable to
it: clones agree with the real coupler through the midrange and drift apart in the
bass (seal and leakage) and above a few kHz (the coupler's resonance and the
nozzle's insertion depth).

How far apart is measured, not assumed. Some earphones were measured on both rigs.
For each of them the difference between the two curves (both aligned at 500 Hz) is
one observation of the clone-to-reference transfer. The median of those differences
is subtracted from every clone-only curve; what the median does not explain — the
residual of each pair, which also carries unit-to-unit variation and how each was
seated — is kept, and the scorer adds one observed residual per draw, so a
converted earphone's predicted range widens by exactly the disagreement seen in
earphones that were measured both ways. Nothing is smoothed into confidence it
does not have.

It is ranked on its converted curve (the median conversion), not on the average
over residuals: those residuals also hold ordinary measurement noise that directly
measured earphones carry too, and averaging over them lowered converted earphones'
expected rating by ~3.6 points (median, 574 earphones) for no reason of fit.
Checked leave-one-out on the 60 earphones measured both ways (2026-11-15): the
converted curve scored a median 1.2 points *below* the directly measured one
(10th-90th percentile -8.7 to +5.3), so ranking on it does not flatter clone data;
that spread is what the widened range shows.

Status: derived. The transfer is a population estimate; any single earphone may
differ from it by one of the residuals, which is why they are kept.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

#: Families that can be converted into the reference family, and the minimum number of
#: earphones measured on both before a conversion is trusted at all.
CONVERTIBLE: dict[str, str] = {"iec60318-4-clone": "iec60318-4"}
MIN_PAIRS = 20


@dataclass(frozen=True, slots=True)
class Transfer:
    source_family: str
    target_family: str
    pairs: int
    #: The median clone-minus-reference difference, on the common grid (0 where unknown).
    offset_db: npt.NDArray[np.float64]
    #: One row per earphone measured on both rigs: its difference minus the median.
    residuals_db: npt.NDArray[np.float64]

    def convert(self, response_db: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
        return response_db - self.offset_db


def fit(
    grid_hz: npt.NDArray[np.float64],
    source: dict[str, npt.NDArray[np.float64]],
    reference: dict[str, npt.NDArray[np.float64]],
    *,
    source_family: str,
    target_family: str,
) -> Transfer | None:
    """The transfer from the earphones measured on both rigs, or None with too few."""
    shared = sorted(set(source) & set(reference))
    if len(shared) < MIN_PAIRS:
        return None
    at = int(np.argmin(np.abs(grid_hz - 500.0)))
    rows = []
    for slug in shared:
        d = source[slug] - reference[slug]
        if np.isnan(d[at]):
            continue
        rows.append(d - d[at])
    if len(rows) < MIN_PAIRS:
        return None
    diffs = np.vstack(rows)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns at the grid's ends
        offset = np.nanmedian(diffs, axis=0)
    offset = np.where(np.isnan(offset), 0.0, offset)
    residuals = np.where(np.isnan(diffs), 0.0, diffs - offset)
    return Transfer(source_family, target_family, len(rows), offset, residuals)
