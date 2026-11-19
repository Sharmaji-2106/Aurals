import numpy as np
import pytest

from auralis.acoustics import fr
from auralis.acoustics.bands import BANDS, band_mask, log_grid
from auralis.iem.importer import checksum, parse_points


def synthetic_curve(
    bass_shelf_db: float = 0.0, lo: float = 20, hi: float = 20_000
) -> list[list[float]]:
    """A made-up test curve: flat with an optional low shelf. Not a real IEM."""
    freqs = log_grid(24, lo, hi)
    db = 90 + bass_shelf_db / (1 + (freqs / 150) ** 2)
    return [[float(f), float(d)] for f, d in zip(freqs, db, strict=True)]


def test_bands_tile_the_spectrum() -> None:
    grid = log_grid(48)
    counts = sum(band_mask(grid, b).astype(int) for b in BANDS)
    assert np.all(counts == 1)


def test_flat_curve_has_zero_band_levels() -> None:
    _, features = fr.process(synthetic_curve())
    assert [b.key for b in features.bands] == [b.key for b in BANDS]
    assert all(abs(b.mean_db) < 1e-6 for b in features.bands)


def test_bass_shelf_shows_up_in_bass_bands_only() -> None:
    _, features = fr.process(synthetic_curve(bass_shelf_db=8))
    levels = {b.key: b.mean_db for b in features.bands}
    assert levels["sub_bass"] > 6
    assert levels["mid_bass"] > 2
    # Curves are aligned at 500 Hz (Harman convention), where this shelf still adds ~0.6 dB.
    assert abs(levels["upper_mids"]) < 1.0


def test_unmeasured_range_stays_unknown() -> None:
    curve, features = fr.process(synthetic_curve(lo=100))
    assert np.isnan(curve.db[0])
    keys = {b.key for b in features.bands}
    assert "sub_bass" not in keys  # never fabricated
    mid_bass = next(b for b in features.bands if b.key == "mid_bass")
    assert 0 < mid_bass.coverage < 1


def test_compensation_against_identical_target_is_flat() -> None:
    target = fr.to_grid(fr.validate_points(synthetic_curve(bass_shelf_db=5)))
    _, features = fr.process(synthetic_curve(bass_shelf_db=5), target=target, target_name="test")
    assert features.compensated_against == "test"
    assert all(abs(b.mean_db) < 1e-6 for b in features.bands)


@pytest.mark.parametrize(
    ("points", "message"),
    [
        ([[100, 1]] * 5, "at least"),
        ([[f, 0] for f in range(1000, 0, -40)], "increasing"),
        ([[f, float("nan")] for f in np.geomspace(20, 20000, 30)], "NaN"),
        ([[f, 0] for f in np.geomspace(200, 20000, 30)], "need at least"),
        ([[f, 0] for f in np.geomspace(20, 5000, 30)], "need at least"),
        ([[f, i * 10] for i, f in enumerate(np.geomspace(20, 20000, 30))], "implausible"),
    ],
)
def test_invalid_measurements_are_rejected(points: list[list[float]], message: str) -> None:
    with pytest.raises(fr.FrValidationError, match=message):
        fr.validate_points(points)


@pytest.mark.parametrize(
    "text",
    [
        "Frequency,dB\n20,90.5\n1000,91\n20000,85\n",
        "# exported by some tool\nfreq\tspl\n20\t90.5\n1000\t91\n20000\t85\n",
        "20;90.5\n1000;91\n20000;85\n",
        "20 90.5\n1000 91\n20000 85\n",
    ],
)
def test_parse_points_handles_headers_and_delimiters(text: str) -> None:
    assert parse_points(text) == [[20.0, 90.5], [1000.0, 91.0], [20000.0, 85.0]]


def test_checksum_is_stable() -> None:
    points = synthetic_curve()
    assert checksum(points) == checksum([list(p) for p in points])
