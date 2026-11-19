"""Loudness and dynamics following ITU-R BS.1770 and EBU Tech 3342.

The K-weighting filters are designed from their analogue prototypes (the approach used
by pyloudnorm), which matches the published 48 kHz coefficients closely and extends to
other sample rates. The loudness range uses 3 s windows at a 0.5 s hop, a coarser
rate than Tech 3342 suggests; values are comparable in practice but not certified.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from scipy.signal import lfilter

BLOCK_S = 0.1  # energy is accumulated in 100 ms blocks and combined into longer windows
ABS_GATE_LUFS = -70.0


@dataclass(frozen=True, slots=True)
class LoudnessStats:
    integrated_lufs: float
    loudness_range_lu: float
    short_term_lufs: npt.NDArray[np.float64]  # ungated, 3 s windows at 0.5 s hop


def _biquad_high_shelf(
    gain_db: float, q: float, fc: float, fs: int
) -> tuple[list[float], list[float]]:
    a = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * fc / fs
    alpha = np.sin(w0) / (2 * q)
    cos = np.cos(w0)
    sq = 2 * np.sqrt(a) * alpha
    b = [
        a * ((a + 1) + (a - 1) * cos + sq),
        -2 * a * ((a - 1) + (a + 1) * cos),
        a * ((a + 1) + (a - 1) * cos - sq),
    ]
    den = [
        (a + 1) - (a - 1) * cos + sq,
        2 * ((a - 1) - (a + 1) * cos),
        (a + 1) - (a - 1) * cos - sq,
    ]
    return [x / den[0] for x in b], [x / den[0] for x in den]


def _biquad_high_pass(q: float, fc: float, fs: int) -> tuple[list[float], list[float]]:
    w0 = 2 * np.pi * fc / fs
    alpha = np.sin(w0) / (2 * q)
    cos = np.cos(w0)
    b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
    den = [1 + alpha, -2 * cos, 1 - alpha]
    return [x / den[0] for x in b], [x / den[0] for x in den]


def k_weight(x: npt.NDArray[np.float32], fs: int) -> npt.NDArray[np.float32]:
    b1, a1 = _biquad_high_shelf(4.0, 1 / np.sqrt(2), 1500.0, fs)
    b2, a2 = _biquad_high_pass(0.5, 38.0, fs)
    y = lfilter(b1, a1, x, axis=-1)
    return np.asarray(lfilter(b2, a2, y, axis=-1), dtype=np.float32)


def _block_energy(x: npt.NDArray[np.float32], fs: int) -> npt.NDArray[np.float64]:
    """Mean square per 100 ms block, summed over channels. Shape (n_blocks,)."""
    block = int(fs * BLOCK_S)
    n = x.shape[-1] // block
    trimmed = x[..., : n * block].astype(np.float64)
    per_channel = (trimmed.reshape(*x.shape[:-1], n, block) ** 2).mean(axis=-1)
    return np.asarray(per_channel.sum(axis=0) if per_channel.ndim == 2 else per_channel)


def _windows(energy: npt.NDArray[np.float64], length: int, hop: int) -> npt.NDArray[np.float64]:
    if energy.size < length:
        return np.asarray([energy.mean()]) if energy.size else np.empty(0)
    csum = np.concatenate([[0.0], np.cumsum(energy)])
    starts = np.arange(0, energy.size - length + 1, hop)
    return np.asarray((csum[starts + length] - csum[starts]) / length)


def _to_lufs(power: npt.NDArray[np.float64]) -> npt.NDArray[np.float64]:
    return np.asarray(-0.691 + 10 * np.log10(np.maximum(power, 1e-12)))


def measure(stereo: npt.NDArray[np.float32], fs: int) -> LoudnessStats:
    energy = _block_energy(k_weight(stereo, fs), fs)

    # Integrated loudness: 400 ms blocks, 75 % overlap, absolute then relative (-10 LU) gate.
    blocks = _windows(energy, 4, 1)
    loud = _to_lufs(blocks)
    gated = blocks[loud > ABS_GATE_LUFS]
    if gated.size == 0:
        integrated = float("-inf")
    else:
        rel_gate = _to_lufs(np.asarray([gated.mean()]))[0] - 10.0
        final = blocks[(loud > ABS_GATE_LUFS) & (loud > rel_gate)]
        integrated = float(_to_lufs(np.asarray([final.mean()]))[0]) if final.size else float("-inf")

    # Loudness range: 3 s windows, absolute gate then relative (-20 LU) gate, p95 - p10.
    short = _windows(energy, 30, 5)
    short_lufs = _to_lufs(short)
    st_gated = short[short_lufs > ABS_GATE_LUFS]
    lra = 0.0
    if st_gated.size >= 2:
        rel = _to_lufs(np.asarray([st_gated.mean()]))[0] - 20.0
        values = short_lufs[(short_lufs > ABS_GATE_LUFS) & (short_lufs > rel)]
        if values.size >= 2:
            lra = float(np.percentile(values, 95) - np.percentile(values, 10))
    return LoudnessStats(
        integrated_lufs=integrated, loudness_range_lu=lra, short_term_lufs=short_lufs
    )
