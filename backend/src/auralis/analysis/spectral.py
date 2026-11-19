"""Long-term spectral statistics computed with a streaming STFT.

Everything here is a direct measurement of the decoded signal. Frames are processed
in chunks so a ten-minute track costs tens of megabytes, not hundreds.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from scipy.fft import rfft, rfftfreq

from auralis.acoustics.bands import BANDS, MAX_HZ, MIN_HZ, BandKey, band_mask, log_grid

N_FFT = 8192  # ~5.4 Hz resolution at 44.1 kHz: enough bins to resolve the sub-bass band
HOP = 4096
CHUNK_FRAMES = 256
REFERENCE_RANGE_HZ = (500.0, 2000.0)  # same reference as FR normalisation
SPECTRUM_POINTS_PER_OCTAVE = 6
ACTIVITY_GATE_DB = 35.0  # frames this far below the loud (p90) frames are ignored


@dataclass(frozen=True, slots=True)
class SpectralStats:
    band_levels_db: dict[BandKey, float]
    spectrum_freqs_hz: npt.NDArray[np.float64]
    spectrum_db: npt.NDArray[np.float64]
    centroid_hz: tuple[float, float, float]  # p10, median, p90
    rolloff_hz: float
    flatness: float
    effective_bandwidth_hz: float
    active_ratio: float


def _frames(x: npt.NDArray[np.float32]) -> npt.NDArray[np.float32]:
    if x.size < N_FFT:
        x = np.pad(x, (0, N_FFT - x.size))
    n = 1 + (x.size - N_FFT) // HOP
    view = np.lib.stride_tricks.sliding_window_view(x, N_FFT)[::HOP]
    return np.asarray(view[:n])


def _fractional_octave_matrix(
    freqs: npt.NDArray[np.float64], centers: npt.NDArray[np.float64]
) -> npt.NDArray[np.float32]:
    """Row-normalised averaging weights; narrow low bands fall back to interpolation."""
    half = 2 ** (1 / (2 * SPECTRUM_POINTS_PER_OCTAVE))
    matrix = np.zeros((centers.size, freqs.size), dtype=np.float32)
    df = freqs[1] - freqs[0]
    for i, fc in enumerate(centers):
        mask = (freqs >= fc / half) & (freqs < fc * half)
        if mask.sum() >= 2:
            matrix[i, mask] = 1.0 / mask.sum()
        else:  # linear interpolation between the two neighbouring bins
            j = min(int(fc // df), freqs.size - 2)
            t = (fc - freqs[j]) / df
            matrix[i, j], matrix[i, j + 1] = 1 - t, t
    return matrix


def analyse(mono: npt.NDArray[np.float32], fs: int) -> SpectralStats:
    freqs = rfftfreq(N_FFT, 1 / fs)
    window = np.hanning(N_FFT).astype(np.float32)
    in_range = (freqs >= MIN_HZ) & (freqs <= min(MAX_HZ, fs / 2))
    band_masks = np.stack([band_mask(freqs, b) for b in BANDS]).astype(np.float32)
    ref_mask = ((freqs >= REFERENCE_RANGE_HZ[0]) & (freqs < REFERENCE_RANGE_HZ[1])).astype(
        np.float32
    )
    centers = log_grid(SPECTRUM_POINTS_PER_OCTAVE, MIN_HZ, min(MAX_HZ, fs / 2 / 1.06))
    octave_matrix = _fractional_octave_matrix(freqs, centers)
    range_f = freqs[in_range].astype(np.float32)

    frames = _frames(mono)
    frame_power: list[npt.NDArray[np.float64]] = []
    band_power: list[npt.NDArray[np.float32]] = []
    ref_power: list[npt.NDArray[np.float32]] = []
    spectrum_rows: list[npt.NDArray[np.float32]] = []
    centroids: list[npt.NDArray[np.float32]] = []
    rolloffs: list[npt.NDArray[np.float32]] = []
    flatness: list[npt.NDArray[np.float32]] = []
    linear_sum = np.zeros(freqs.size, dtype=np.float64)

    for start in range(0, frames.shape[0], CHUNK_FRAMES):
        chunk = frames[start : start + CHUNK_FRAMES] * window
        power = (np.abs(rfft(chunk, axis=1)) ** 2).astype(np.float32)
        linear_sum += power.sum(axis=0)
        in_band = power[:, in_range]
        total = in_band.sum(axis=1) + 1e-20
        frame_power.append(total.astype(np.float64))
        band_power.append(power @ band_masks.T)
        ref_power.append(power @ ref_mask)
        spectrum_rows.append(power @ octave_matrix.T)
        # Centroid and roll-off use magnitude weighting, the usual MIR convention;
        # power weighting would pull both towards the bass.
        magnitude = np.sqrt(in_band)
        mag_total = magnitude.sum(axis=1) + 1e-20
        centroids.append((magnitude @ range_f) / mag_total)
        cumulative = np.cumsum(magnitude, axis=1)
        idx = np.minimum((cumulative < 0.85 * mag_total[:, None]).sum(axis=1), range_f.size - 1)
        rolloffs.append(range_f[idx])
        log_mean = np.log(in_band + 1e-20).mean(axis=1)
        flatness.append(np.exp(log_mean) / (in_band.mean(axis=1) + 1e-20))

    energy = np.concatenate(frame_power)
    energy_db = 10 * np.log10(energy)
    active = energy_db > (np.percentile(energy_db, 90) - ACTIVITY_GATE_DB)
    if not active.any():
        active = np.ones_like(active)

    # Long-term average power in each band (and in the reference range), active frames only.
    bands = np.concatenate(band_power)[active].mean(axis=0).astype(np.float64)
    ref = float(np.concatenate(ref_power)[active].mean())
    ref_octaves = float(np.log2(REFERENCE_RANGE_HZ[1] / REFERENCE_RANGE_HZ[0]))
    ref_density = ref / ref_octaves + 1e-30
    band_levels: dict[BandKey, float] = {}
    for band, value in zip(BANDS, bands, strict=True):
        top = min(band.high_hz, fs / 2)
        octaves = float(np.log2(top / band.low_hz))
        # Power per octave relative to the reference range: pink noise reads 0 dB everywhere.
        band_levels[band.key] = float(10 * np.log10(value / octaves / ref_density + 1e-30))

    spectrum = np.concatenate(spectrum_rows)[active].mean(axis=0).astype(np.float64)
    # Per-bin mean power grows with bin width on a log axis; convert to power per octave
    # (multiply by frequency) so the curve reads like the band levels above.
    spectrum_db = 10 * np.log10(spectrum * centers + 1e-30)
    ref_centers = (centers >= REFERENCE_RANGE_HZ[0]) & (centers < REFERENCE_RANGE_HZ[1])
    spectrum_db -= spectrum_db[ref_centers].mean()

    # Effective bandwidth: the highest frequency within 70 dB of the loudest part of the
    # spectrum. Lossy codecs low-pass the signal far below that; this tells us how much
    # "air" is even measurable. Summed power is dominated by loud frames, so no gating.
    density_db = 10 * np.log10(linear_sum + 1e-30)
    smoothed = np.convolve(density_db, np.ones(21) / 21, mode="same")
    peak = float(smoothed[(freqs >= 30) & (freqs <= 5000)].max())
    audible = np.nonzero((smoothed > peak - 70) & (freqs >= 100))[0]
    bandwidth = float(freqs[audible[-1]]) if audible.size else 0.0

    c = np.concatenate(centroids)[active]
    return SpectralStats(
        band_levels_db=band_levels,
        spectrum_freqs_hz=centers,
        spectrum_db=spectrum_db,
        centroid_hz=(
            float(np.percentile(c, 10)),
            float(np.median(c)),
            float(np.percentile(c, 90)),
        ),
        rolloff_hz=float(np.median(np.concatenate(rolloffs)[active])),
        flatness=float(np.median(np.concatenate(flatness)[active])),
        effective_bandwidth_hz=bandwidth,
        active_ratio=float(active.mean()),
    )
