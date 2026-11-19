"""Signal-level checks against physical references (no network, no database)."""

from pathlib import Path

import numpy as np
import pytest

from auralis.analysis import loudness, spectral
from auralis.analysis.decode import AudioDecodeError, AudioSignal, decode_audio
from auralis.analysis.descriptors import describe, load_calibration
from auralis.analysis.features import TrackRejected, extract

SR = 44_100


def pink_noise(seconds: float, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    freqs[0] = freqs[1]
    signal = np.fft.irfft(spectrum / np.sqrt(freqs), n=n)
    return (signal / np.abs(signal).max() * 0.5).astype(np.float32)


def as_signal(stereo: np.ndarray) -> AudioSignal:
    return AudioSignal(stereo.astype(np.float32), SR, None, None, None, None, False)


def test_pink_noise_reads_flat_across_bands() -> None:
    stats = spectral.analyse(pink_noise(30), SR)
    for key, level in stats.band_levels_db.items():
        assert abs(level) < 1.0, key
    # Fractional-octave spectrum is flat too (ignoring the lowest, interpolated points).
    assert np.ptp(stats.spectrum_db[6:]) < 3.0


def test_low_passed_noise_shifts_energy_to_bass() -> None:
    from scipy.signal import butter, sosfilt

    sos = butter(4, 300, "low", fs=SR, output="sos")
    dark = sosfilt(sos, pink_noise(30)).astype(np.float32)
    stats = spectral.analyse(dark, SR)
    assert stats.band_levels_db["mid_bass"] > 0
    assert stats.band_levels_db["presence"] < -20
    assert stats.effective_bandwidth_hz < 10_000


def test_integrated_loudness_matches_bs1770_reference() -> None:
    # A 997 Hz sine at 0 dBFS in both channels reads 0 LUFS (-3.01 per channel).
    t = np.arange(20 * SR) / SR
    tone = (0.1 * np.sin(2 * np.pi * 997 * t)).astype(np.float32)  # -20 dBFS
    stats = loudness.measure(np.stack([tone, tone]), SR)
    assert stats.integrated_lufs == pytest.approx(-20.0, abs=0.15)
    assert stats.loudness_range_lu == pytest.approx(0.0, abs=0.2)


def test_loudness_range_grows_with_level_changes() -> None:
    t = np.arange(60 * SR) / SR
    tone = np.sin(2 * np.pi * 997 * t)
    envelope = np.where(t < 30, 0.5, 0.05)  # a 20 dB step halfway through
    signal = (tone * envelope).astype(np.float32)
    stats = loudness.measure(np.stack([signal, signal]), SR)
    assert stats.loudness_range_lu > 15


def test_extract_features_on_stereo_noise() -> None:
    left, right = pink_noise(40, 1), pink_noise(40, 2)
    features = extract(as_signal(np.stack([left, right])))
    assert features.side_to_mid_db == pytest.approx(0.0, abs=1.0)  # uncorrelated channels
    assert 0 <= features.percussive_ratio <= 1
    assert len(features.mfcc_mean) == 20
    mono = extract(as_signal(np.stack([left, left])))
    assert mono.side_to_mid_db < -60


def test_silence_is_rejected() -> None:
    with pytest.raises(TrackRejected) as exc:
        extract(as_signal(np.zeros((2, 40 * SR), dtype=np.float32)))
    assert exc.value.code in {"silent", "too_short"}


def test_short_audio_is_rejected() -> None:
    noise = pink_noise(5)
    with pytest.raises(TrackRejected) as exc:
        extract(as_signal(np.stack([noise, noise])))
    assert exc.value.code == "too_short"


def test_decode_rejects_non_audio(tmp_path: Path) -> None:
    bogus = tmp_path / "not-audio.webm"
    bogus.write_bytes(b"this is not a media file")
    with pytest.raises(AudioDecodeError):
        decode_audio(bogus)


def test_decode_roundtrip_wav(tmp_path: Path) -> None:
    import soundfile as sf

    noise = pink_noise(3)
    path = tmp_path / "noise.wav"
    sf.write(path, np.stack([noise, noise * 0.5]).T, 48_000)
    signal = decode_audio(path, max_seconds=2)
    assert signal.samples.shape == (2, 2 * SR)
    assert signal.truncated
    assert signal.source_sample_rate == 48_000


def test_descriptors_are_centred_for_typical_tracks() -> None:
    from tests.factories import make_features

    descriptors = describe(make_features())
    assert descriptors.calibration == load_calibration().id
    for key, value in descriptors.values.items():
        assert 0.35 < value < 0.65, key
    bright = describe(make_features(band_offsets={"presence": 8, "lower_treble": 8}))
    assert bright.band_emphasis["presence"] > 0.8
