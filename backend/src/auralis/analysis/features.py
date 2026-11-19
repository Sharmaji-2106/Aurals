"""Per-track feature extraction: the *measured* layer.

Every value in :class:`TrackFeatures` is a direct, reproducible measurement of the
decoded audio. Interpretation (e.g. "this track is warm") happens in
:mod:`auralis.analysis.descriptors`, never here.
"""

from __future__ import annotations

import warnings

import librosa
import numpy as np
import numpy.typing as npt
import soxr
from pydantic import BaseModel, Field

from auralis.acoustics.bands import BANDS_VERSION, BandKey
from auralis.analysis import loudness, spectral
from auralis.analysis.decode import AudioSignal
from auralis.analysis.version import ANALYZER_VERSION

RHYTHM_SR = 22_050
MIN_ANALYSABLE_SECONDS = 20.0
SILENCE_LUFS = -60.0
EXCERPT_SECONDS = 30.0
N_MFCC = 20


class TrackRejected(Exception):
    """Audio decoded fine but isn't suitable for analysis (silence, too short, ...)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Spread(BaseModel):
    p10: float
    median: float
    p90: float


class TrackFeatures(BaseModel):
    analyzer_version: str = ANALYZER_VERSION
    bands_version: str = BANDS_VERSION

    # Source
    analysed_seconds: float
    sample_rate: int
    source_codec: str | None
    source_sample_rate: int | None
    truncated: bool
    effective_bandwidth_hz: float = Field(
        description="Highest frequency with meaningful content; lossy codecs cap this."
    )

    # Loudness and dynamics (ITU-R BS.1770 / EBU Tech 3342 style)
    integrated_lufs: float
    loudness_range_lu: float
    sample_peak_dbfs: float
    peak_to_loudness_db: float

    # Spectral balance: power per octave relative to 500-2000 Hz (pink noise = 0 dB)
    band_levels_db: dict[BandKey, float]
    spectrum_freqs_hz: list[float]
    spectrum_db: list[float]
    centroid_hz: Spread
    rolloff_hz: float
    flatness: float

    # Stereo image
    side_to_mid_db: float = Field(
        description="Side-channel energy relative to mid; lower = narrower"
    )

    # Rhythm and texture
    tempo_bpm: float | None
    onset_rate_hz: float
    percussive_ratio: float = Field(ge=0, le=1)

    # Timbre embedding (MFCC statistics) used for similarity and clustering only
    mfcc_mean: list[float]
    mfcc_std: list[float]


def rounded(value: float) -> float:
    """Keep stored JSON compact; four decimals is far below measurement precision."""
    return round(float(value), 4)


def _excerpts(x: npt.NDArray[np.float32], sr: int) -> npt.NDArray[np.float32]:
    """Three 30 s excerpts (at 20 %, 50 %, 80 %) or the whole signal if it is short."""
    length = int(EXCERPT_SECONDS * sr)
    if x.size <= 3 * length:
        return x
    parts = []
    for pos in (0.2, 0.5, 0.8):
        start = min(int(pos * x.size) - length // 2, x.size - length)
        parts.append(x[max(0, start) : max(0, start) + length])
    return np.concatenate(parts)


def _trim_silence(stereo: npt.NDArray[np.float32], sr: int) -> npt.NDArray[np.float32]:
    """Drop leading/trailing audio quieter than -50 dB relative to the track's peak."""
    env = np.abs(stereo).max(axis=0)
    hop = sr // 20
    n = env.size // hop
    if n == 0:
        return stereo
    blocks = env[: n * hop].reshape(n, hop).max(axis=1)
    loud = np.nonzero(blocks > blocks.max() * 10 ** (-50 / 20))[0]
    if loud.size == 0:
        return stereo[:, :0]
    return stereo[:, loud[0] * hop : (loud[-1] + 1) * hop]


def extract(signal: AudioSignal) -> TrackFeatures:
    sr = signal.sample_rate
    stereo = _trim_silence(signal.samples, sr)
    seconds = stereo.shape[1] / sr
    if seconds < MIN_ANALYSABLE_SECONDS:
        raise TrackRejected("too_short", f"only {seconds:.1f} s of non-silent audio")

    loud = loudness.measure(stereo, sr)
    if not np.isfinite(loud.integrated_lufs) or loud.integrated_lufs < SILENCE_LUFS:
        raise TrackRejected("silent", "track is silent or nearly silent")

    left, right = stereo[0].astype(np.float64), stereo[1].astype(np.float64)
    mid_energy = float(np.mean(((left + right) / 2) ** 2))
    side_energy = float(np.mean(((left - right) / 2) ** 2))
    side_to_mid = 10 * np.log10((side_energy + 1e-12) / (mid_energy + 1e-12))

    mono = np.asarray(stereo.mean(axis=0), dtype=np.float32)
    spec = spectral.analyse(mono, sr)
    peak = float(np.abs(stereo).max())
    peak_dbfs = 20 * np.log10(max(peak, 1e-9))

    y = soxr.resample(mono, sr, RHYTHM_SR).astype(np.float32)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        onset_env = librosa.onset.onset_strength(y=y, sr=RHYTHM_SR)
        tempo_arr, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=RHYTHM_SR)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=RHYTHM_SR)

        excerpt = _excerpts(y, RHYTHM_SR)
        stft = np.abs(librosa.stft(excerpt, n_fft=2048, hop_length=512)) ** 2
        harmonic, percussive = librosa.decompose.hpss(stft)
        perc_ratio = float(percussive.sum() / (harmonic.sum() + percussive.sum() + 1e-12))
        mel = librosa.feature.melspectrogram(S=stft, sr=RHYTHM_SR, n_mels=64)
        mfcc = librosa.feature.mfcc(S=librosa.power_to_db(mel), n_mfcc=N_MFCC)

    tempo = float(np.atleast_1d(tempo_arr)[0])

    return TrackFeatures(
        analysed_seconds=round(seconds, 2),
        sample_rate=sr,
        source_codec=signal.source_codec,
        source_sample_rate=signal.source_sample_rate,
        truncated=signal.truncated,
        effective_bandwidth_hz=round(spec.effective_bandwidth_hz, 1),
        integrated_lufs=rounded(loud.integrated_lufs),
        loudness_range_lu=rounded(loud.loudness_range_lu),
        sample_peak_dbfs=rounded(peak_dbfs),
        peak_to_loudness_db=rounded(peak_dbfs - loud.integrated_lufs),
        band_levels_db={k: rounded(v) for k, v in spec.band_levels_db.items()},
        spectrum_freqs_hz=[round(float(f), 2) for f in spec.spectrum_freqs_hz],
        spectrum_db=[rounded(v) for v in spec.spectrum_db],
        centroid_hz=Spread(
            p10=rounded(spec.centroid_hz[0]),
            median=rounded(spec.centroid_hz[1]),
            p90=rounded(spec.centroid_hz[2]),
        ),
        rolloff_hz=rounded(spec.rolloff_hz),
        flatness=rounded(spec.flatness),
        side_to_mid_db=rounded(side_to_mid),
        tempo_bpm=rounded(tempo) if tempo > 0 else None,
        onset_rate_hz=rounded(len(onsets) / (y.size / RHYTHM_SR)),
        percussive_ratio=rounded(perc_ratio),
        mfcc_mean=[rounded(v) for v in mfcc.mean(axis=1)],
        mfcc_std=[rounded(v) for v in mfcc.std(axis=1)],
    )
