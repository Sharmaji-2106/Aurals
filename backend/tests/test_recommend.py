"""Recommender behaviour on synthetic curves (clearly fake; never real earphones)."""

import uuid
from decimal import Decimal

import numpy as np
import pytest

from auralis.acoustics import fr
from auralis.acoustics.bands import log_grid
from auralis.recommend.band_rms import BandRmsRecommender
from auralis.recommend.base import Candidate, Constraints, MeasurementRef, Price, Target
from auralis.recommend.harman import HarmanPersonalRecommender, match_word
from auralis.sound_profile.fusion import fuse

GRID = log_grid(fr.GRID_POINTS_PER_OCTAVE)


def shelf(freqs: np.ndarray, gain: float, corner: float, high: bool = False) -> np.ndarray:
    """A first-order-ish shelf in dB: smooth, made up, good enough for ranking tests."""
    ratio = (freqs / corner) ** 2
    return gain * (ratio / (1 + ratio) if high else 1 / (1 + ratio))


TARGET_DB = shelf(GRID, 9, 105) + 8 * np.exp(-((np.log2(GRID / 3000)) ** 2) / 0.8)
TARGET = Target(
    name="synthetic",
    label="Synthetic target",
    citation="test",
    rig_family="iec60318-4",
    freqs_hz=GRID,
    db=TARGET_DB - np.interp(500, GRID, TARGET_DB),
)


def candidate(
    name: str,
    bass: float = 0.0,
    treble: float = 0.0,
    price: float | None = 100,
    currency: str = "USD",
    rig_family: str = "iec60318-4",
) -> Candidate:
    db = TARGET.db + shelf(GRID, bass, 150) + shelf(GRID, treble, 5000, high=True)
    return Candidate(
        iem_id=uuid.uuid4(),
        brand="Test",
        model=name,
        slug=f"test-{name.lower()}",
        price=Price(amount=Decimal(price), currency=currency) if price is not None else None,
        measurement=MeasurementRef(
            source="synthetic",
            rig="synthetic",
            rig_family=rig_family,
            variant=None,
            source_ref=None,
            license=None,
        ),
        freqs_hz=GRID,
        response_db=db - np.interp(500, GRID, db),
    )


BASSY = candidate("Bassy", bass=6)
NEUTRAL = candidate("Neutral")
BRIGHT = candidate("Bright", treble=6)
LEAN = candidate("Lean", bass=-5)
ALL = [BASSY, NEUTRAL, BRIGHT, LEAN]


def names(recs) -> list[str]:  # type: ignore[no-untyped-def]
    return [r.model for r in recs]


def run(answers, candidates=ALL, constraints=None, engine=None):  # type: ignore[no-untyped-def]
    profile = fuse(music=None, answers=answers)
    return (engine or HarmanPersonalRecommender()).recommend(
        profile, candidates, TARGET, constraints or Constraints(), limit=10
    )


def test_without_evidence_the_reference_wins() -> None:
    recs = run(None)
    assert names(recs)[0] == "Neutral"
    top = recs[0]
    assert top.population_preference == pytest.approx(fr.OLIVE_INTERCEPT, abs=0.5)


def test_bass_lover_gets_the_bassy_candidate_first() -> None:
    recs = run({"bass_amount": "5", "bass_character": "rumble"})
    assert names(recs)[0] == "Bassy"
    assert names(recs).index("Lean") == len(ALL) - 1


def test_bass_light_listener_moves_the_other_way() -> None:
    assert names(run({"bass_amount": "1"}))[0] == "Lean"


def test_treble_sensitive_listener_is_steered_away_from_bright_tuning() -> None:
    recs = run({"treble_feel": "harsh"})
    tolerant = run({"treble_feel": "sparkle"})
    assert names(recs).index("Bright") > names(recs).index("Neutral")
    assert names(recs).index("Bright") > names(tolerant).index("Bright")
    bright = next(r for r in recs if r.model == "Bright")
    assert any("tire you" in r.message for r in bright.reasons)


def test_reasons_quote_the_numbers_they_came_from() -> None:
    recs = run({"bass_amount": "5"})
    lean = next(r for r in recs if r.model == "Lean")
    bass = next(g for g in lean.regions if g.region == "bass")
    assert bass.fit == "below"
    mismatch = next(r for r in lean.reasons if r.kind == "mismatch" and r.region == "bass")
    assert mismatch.error_db == bass.error_db
    assert f"{abs(bass.error_db or 0):.1f} dB below" in mismatch.message
    assert f"±{bass.tolerance_db:.1f} dB" in mismatch.message


def test_prediction_carries_the_profile_uncertainty() -> None:
    vague = run(None)[0].predicted_preference
    sure = run({"bass_amount": "3", "treble_feel": "fine", "vocals": "3", "tone": "3"})[0]
    assert vague.low <= vague.mean <= vague.high
    width = sure.predicted_preference.high - sure.predicted_preference.low
    assert width < vague.high - vague.low


def test_results_are_deterministic() -> None:
    first = run({"bass_amount": "4"})
    second = run({"bass_amount": "4"})
    assert [r.predicted_preference for r in first] == [r.predicted_preference for r in second]


def test_budget_filters_known_prices_and_flags_unknown_ones() -> None:
    pricey = candidate("Pricey", price=900)
    unknown = candidate("Unknown", price=None)
    other = candidate("Euro", price=900, currency="EUR")
    recs = run(
        None,
        [pricey, unknown, other, NEUTRAL],
        Constraints(budget_max=Decimal(200), currency="USD"),
    )
    assert "Pricey" not in names(recs)
    assert {"Unknown", "Euro", "Neutral"} <= set(names(recs))
    unknown_rec = next(r for r in recs if r.model == "Unknown")
    assert any("No verified price" in r.message for r in unknown_rec.reasons)
    euro = next(r for r in recs if r.model == "Euro")
    assert any("Priced in EUR" in r.message for r in euro.reasons)


def test_other_rig_families_are_never_compared() -> None:
    other = candidate("Other rig", rig_family="b&k-5128")
    assert "Other rig" not in names(run(None, [other, NEUTRAL]))


def test_comparator_ranks_on_the_same_inputs() -> None:
    recs = run({"bass_amount": "5"}, engine=BandRmsRecommender())
    assert names(recs)[0] == "Bassy"


def test_match_words_follow_the_rating() -> None:
    assert [match_word(v) for v in (95, 70, 50, 20)] == ["close", "good", "partial", "poor"]
