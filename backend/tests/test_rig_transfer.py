"""Clone-coupler measurements join the ranking through a measured conversion."""

from __future__ import annotations

import numpy as np

from auralis.recommend import rig_transfer
from auralis.recommend.base import Constraints
from auralis.recommend.harman import HarmanPersonalRecommender
from auralis.sound_profile.fusion import fuse
from tests.test_recommend import GRID, TARGET, candidate, shelf


def _pairs(n: int, offset: np.ndarray, noise: float, seed: int = 3):
    """Earphones measured on both rigs. Rigs disagree smoothly (seal in the bass,
    resonance in the treble), so each pair's disagreement is a pair of shelves."""
    rng = np.random.default_rng(seed)
    ref = {f"m{i}": rng.normal(0, 3, GRID.size) for i in range(n)}
    src = {
        k: v
        + offset
        + shelf(GRID, rng.normal(0, noise), 120)
        + shelf(GRID, rng.normal(0, noise), 4000, high=True)
        for k, v in ref.items()
    }
    return src, ref


def test_too_few_shared_earphones_means_no_conversion() -> None:
    src, ref = _pairs(rig_transfer.MIN_PAIRS - 1, np.zeros(GRID.size), 0.5)
    assert rig_transfer.fit(GRID, src, ref, source_family="a", target_family="b") is None


def test_the_conversion_recovers_the_rig_difference() -> None:
    # The clone reads 3 dB hot in the treble relative to the reference.
    offset = shelf(GRID, 3, 6000, high=True)
    src, ref = _pairs(60, offset, 0.4)
    t = rig_transfer.fit(GRID, src, ref, source_family="a", target_family="b")
    assert t is not None
    assert t.pairs == 60
    at = int(np.argmin(np.abs(GRID - 500)))
    expected = offset - offset[at]
    treble = GRID > 8000
    assert np.allclose(t.offset_db[treble], expected[treble], atol=0.35)
    assert t.residuals_db.shape == (60, GRID.size)


def test_a_converted_earphone_carries_a_wider_range() -> None:
    offset = np.zeros(GRID.size)
    src, ref = _pairs(40, offset, 2.0)
    t = rig_transfer.fit(GRID, src, ref, source_family="clone", target_family="iec60318-4")
    assert t is not None
    direct = candidate("Direct", bass=2)
    converted = candidate("Converted", bass=2, rig_family="clone")
    converted.measurement.converted_to = "iec60318-4"
    converted.measurement.conversion_pairs = t.pairs
    converted.transfer_residuals = t.residuals_db
    profile = fuse(music=None, answers={"bass_amount": "4"})
    recs = HarmanPersonalRecommender().recommend(
        profile, [direct, converted], TARGET, Constraints(), limit=2
    )
    by = {r.model: r for r in recs}
    assert set(by) == {"Direct", "Converted"}
    width = lambda r: r.predicted_preference.high - r.predicted_preference.low  # noqa: E731
    assert width(by["Converted"]) > width(by["Direct"]) + 1
    assert any("clone coupler" in reason.message for reason in by["Converted"].reasons)
