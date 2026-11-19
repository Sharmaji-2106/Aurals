"""The evaluation code itself, on synthetic data (clearly fake)."""

import numpy as np

from auralis.analysis.curation import CurationTrack
from auralis.evaluation import recommendation as rec
from auralis.evaluation import structure
from auralis.evaluation.data import Library
from auralis.evaluation.representation import split_half
from auralis.sound_profile.fusion import fuse
from tests.factories import make_features
from tests.test_recommend import TARGET, candidate

LINEUP = [
    candidate(f"B{gain:+.0f}/T{tilt:+.0f}", bass=gain, treble=tilt)
    for gain in (-4, -2, 0, 2, 4, 6)
    for tilt in (-3, 0, 3)
]


def test_overlap_and_kendall() -> None:
    assert rec.overlap(list("abcd"), list("abcd"), k=2) == 1.0
    assert rec.overlap(list("abcd"), list("cdab"), k=2) == 0.0
    assert rec.kendall(list("abcd"), list("abcd")) == 1.0
    assert rec.kendall(list("abcd"), list("dcba")) == -1.0


def test_sensitivity_follows_the_target() -> None:
    bass = rec.sensitivity(LINEUP, TARGET, "bass")
    assert bass.monotonic
    assert bass.spearman > 0.9
    treble = rec.sensitivity(LINEUP, TARGET, "treble")
    assert treble.spearman > 0.8


def test_shifted_profile_moves_only_what_it_says() -> None:
    profile = rec.shifted_profile(bass_db=3)
    curve = {c.band: c.offset_db for c in profile.preference_curve}
    assert curve["sub_bass"] == curve["mid_bass"] == 3
    assert curve["upper_mids"] == 0


def test_explanations_pass_their_own_audit() -> None:
    audit = rec.explanation_audit(
        [fuse(music=None, answers={"bass_amount": "5"}), rec.shifted_profile(treble_db=-3)],
        LINEUP,
        TARGET,
    )
    assert audit.reasons > 0
    assert audit.consistent == audit.reasons


def test_pca_finds_the_bass_shelf_when_bass_is_what_varies() -> None:
    rng = np.random.default_rng(0)
    lineup = [candidate(f"B{i}", bass=float(g)) for i, g in enumerate(rng.normal(0, 4, 30))]
    result = structure.pca(lineup, TARGET, k=2)
    assert result.components[0].variance_explained > 0.95
    assert result.components[0].shape == "bass shelf"


def test_split_half_needs_enough_songs_and_reports_noise() -> None:
    rng = np.random.default_rng(1)
    tracks = [
        CurationTrack(
            f"s{i}", make_features(rng, jitter=0.3, band_offsets={"sub_bass": 12, "air": -8})
        )
        for i in range(40)
    ]
    assert split_half(Library("tiny", tracks[:6], None)) is None
    result = split_half(Library("shaped", tracks, None))
    assert result is not None
    assert result.reliability is not None
    assert result.reliability > 0.9
    assert all(v >= 0 for v in result.per_band_sd_db.values())
