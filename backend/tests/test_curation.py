import numpy as np
import pytest

from auralis.analysis.aggregate import build_profile, label_clusters, weighted_quantiles
from auralis.analysis.curation import OUTLIER_WEIGHT, CurationTrack, curate
from tests.factories import make_features


def library(n: int, seed: int = 0, **kwargs: object) -> list[CurationTrack]:
    rng = np.random.default_rng(seed)
    return [
        CurationTrack(f"t{seed}-{i}", make_features(rng, jitter=0.5, **kwargs))  # type: ignore[arg-type]
        for i in range(n)
    ]


def test_weighted_quantiles() -> None:
    assert weighted_quantiles([1, 2, 3], [1, 1, 1], [0.5]) == [2.0]
    # Zero-weight values are ignored entirely.
    assert weighted_quantiles([1, 2, 100], [1, 1, 0], [0.5]) == [1.5]


def test_duplicate_recordings_count_once() -> None:
    tracks = library(10)
    tracks.append(CurationTrack("copy", tracks[3].features))
    result = curate(tracks)
    assert result.duplicate_of == {"copy": tracks[3].track_id}
    assert result.weights["copy"] == 0


def test_atypical_track_is_down_weighted_not_dropped() -> None:
    tracks = library(15)
    odd = make_features(
        band_offsets={"sub_bass": -40, "mid_bass": -30, "presence": 15, "air": 25},
        integrated_lufs=-35.0,
        flatness=0.5,
    )
    tracks.append(CurationTrack("podcast", odd))
    result = curate(tracks)
    assert "podcast" in result.outlier_scores
    assert result.weights["podcast"] == OUTLIER_WEIGHT
    assert sum(1 for w in result.weights.values() if w == 1.0) == 15


def test_two_listening_modes_become_two_clusters() -> None:
    heavy = library(12, seed=1, band_offsets={"sub_bass": 18, "mid_bass": 8, "air": -8})
    light = library(12, seed=2, band_offsets={"sub_bass": -18, "mid_bass": -6, "air": 8})
    result = curate(heavy + light)
    assert result.cluster_count == 2
    heavy_clusters = {result.cluster_of[t.track_id] for t in heavy}
    light_clusters = {result.cluster_of[t.track_id] for t in light}
    assert len(heavy_clusters) == 1
    assert len(light_clusters) == 1
    assert heavy_clusters != light_clusters


def test_cluster_labels_are_unique() -> None:
    library_traits = dict.fromkeys(
        ["brightness", "warmth", "energy", "dynamics", "density", "width", "bass"], 0.5
    )
    same_direction = [
        {**library_traits, "brightness": 0.7, "bass": 0.6},
        {**library_traits, "brightness": 0.65, "bass": 0.62, "energy": 0.56},
    ]
    labels = label_clusters(same_direction, library_traits)
    assert len(set(labels)) == 2


def test_profile_shape_and_notes() -> None:
    profile = build_profile(library(5))
    assert profile.counts.analysed == 5
    assert profile.bands[0].key == "sub_bass"
    assert len(profile.map) == 5
    assert any("Add more music" in note for note in profile.notes)
    assert all(0 <= b.confidence <= 1 for b in profile.bands)
    assert len(profile.spectrum.median_db) == len(profile.spectrum.freqs_hz)


def test_lossy_sources_lower_air_confidence() -> None:
    full = build_profile(library(20))
    capped = build_profile(library(20, effective_bandwidth_hz=15_000.0))
    air = {
        p: next(b for b in prof.bands if b.key == "air")
        for p, prof in (("full", full), ("capped", capped))
    }
    assert air["capped"].confidence < air["full"].confidence
    assert any("16 kHz" in note for note in capped.notes)


def test_empty_library_is_an_error() -> None:
    with pytest.raises(ValueError, match="zero tracks"):
        build_profile([])


def offset_library(n: int, offsets: dict[str, float], seed: int = 11) -> list[CurationTrack]:
    rng = np.random.default_rng(seed)
    return [
        CurationTrack(f"o{i}", make_features(rng, jitter=0.3, band_offsets=offsets))
        for i in range(n)
    ]


def test_band_balance_recovers_a_known_offset_in_db() -> None:
    profile = build_profile(offset_library(30, {"sub_bass": 6.0, "air": -4.0}))
    bands = {b.key: b for b in profile.bands}
    sub, air = bands["sub_bass"].balance_db, bands["air"].balance_db
    assert sub is not None
    assert air is not None
    # Factories centre tracks on the corpus medians, so the offsets come back in dB.
    assert sub.estimate == pytest.approx(6.15, abs=0.6)
    assert air.estimate == pytest.approx(-4.0, abs=0.6)
    assert sub.ci_low < sub.estimate < sub.ci_high
    assert bands["sub_bass"].balance_z is not None
    assert bands["sub_bass"].balance_z.estimate > 0


def test_bootstrap_is_deterministic_and_narrows_with_more_songs() -> None:
    small = build_profile(offset_library(8, {}))
    again = build_profile(offset_library(8, {}))
    large = build_profile(offset_library(60, {}))

    def se(profile) -> float:  # type: ignore[no-untyped-def]
        return next(b for b in profile.bands if b.key == "mid_bass").balance_db.se

    assert se(small) == se(again)
    assert se(large) < se(small)


def test_tiny_library_admits_its_uncertainty() -> None:
    profile = build_profile(offset_library(2, {}))
    balance = next(b for b in profile.bands if b.key == "sub_bass").balance_db
    assert balance is not None
    assert balance.method == "approximation"
    assert balance.se > 5  # sub-bass varies by ~14 dB across the corpus
