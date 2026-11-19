import math

import numpy as np
import pytest

from auralis.analysis.aggregate import build_profile
from auralis.analysis.curation import CurationTrack
from auralis.questionnaire.definition import QUESTIONS, AnswerError, validate_answers
from auralis.sound_profile.assumptions import DEFAULT
from auralis.sound_profile.fusion import FeedbackSignal, fuse
from tests.factories import make_features


def dims(profile):  # type: ignore[no-untyped-def]
    return {d.key: d for d in profile.dimensions}


def music(n: int, offsets: dict[str, float], seed: int = 3):  # type: ignore[no-untyped-def]
    rng = np.random.default_rng(seed)
    return build_profile(
        [
            CurationTrack(f"t{seed}-{i}", make_features(rng, jitter=0.3, band_offsets=offsets))
            for i in range(n)
        ]
    )


def bass_heavy_music():  # type: ignore[no-untyped-def]
    return music(30, {"sub_bass": 14, "mid_bass": 4})


def test_no_evidence_is_the_population_reference() -> None:
    profile = fuse(music=None, answers=None)
    for d in profile.dimensions:
        assert d.value == 0.5
        assert d.confidence == 0
        assert d.mean == 0
    assert all(c.offset_db == 0 for c in profile.preference_curve)
    assert profile.reference_target == "harman-ie-2019"


def test_music_alone_shifts_the_prior_in_db() -> None:
    profile = fuse(music=bass_heavy_music(), answers=None)
    sub = dims(profile)["sub_bass"]
    assert sub.unit == "dB"
    # rho * sigma * z: a clearly bass-heavy library suggests a few dB more bass, not 14.
    assert 0.5 < sub.mean < DEFAULT.sd_bass_db
    assert sub.music_value == sub.value
    assert sub.basis.music in {"strong", "moderate"}
    assert profile.layers.music == profile.preference_curve
    assert profile.layers.answers is None


def test_music_does_not_speak_for_what_it_cannot_measure() -> None:
    d = dims(fuse(music=bass_heavy_music(), answers=None))
    for key in ("treble_tolerance", "detail", "soundstage", "naturalness"):
        assert d[key].value == 0.5
        assert d[key].confidence == 0
        assert d[key].basis.music == "none"
        assert not d[key].measurable_from_music


def test_lossy_top_end_is_not_read_as_taste() -> None:
    capped = build_profile(
        [
            CurationTrack(
                f"c{i}", make_features(np.random.default_rng(i), effective_bandwidth_hz=15_000.0)
            )
            for i in range(20)
        ]
    )
    assert dims(fuse(music=capped, answers=None))["air"].basis.music == "none"


def test_answers_refine_the_music_prior() -> None:
    library = bass_heavy_music()
    answers = {"bass_amount": "1"}  # "just a hint" of bass: -3 dB
    combined = dims(fuse(music=library, answers=answers))["sub_bass"]
    alone = dims(fuse(music=None, answers=answers))["sub_bass"]
    anchor = dims(fuse(music=library, answers=None))["sub_bass"]
    assert alone.mean < combined.mean < anchor.mean
    assert combined.basis.agreement == "differ"
    assert combined.sd < min(alone.sd, anchor.sd)  # two sources narrow the estimate
    assert sum(e.weight for e in combined.evidence) == pytest.approx(1, abs=0.01)


def test_small_libraries_count_for_less() -> None:
    answers = {"bass_amount": "5"}

    def music_share(n: int) -> float:
        profile = fuse(music=music(n, {"sub_bass": -8}), answers=answers)
        sub = dims(profile)["sub_bass"]
        return next(e.weight for e in sub.evidence if e.source == "music")

    assert music_share(3) < music_share(40)


def test_without_music_answers_update_the_population_prior() -> None:
    profile = fuse(music=None, answers={"bass_amount": "5"})
    sub = dims(profile)["sub_bass"]
    # Conjugate normal: posterior mean = r * y for a single answer y with reliability r.
    assert sub.mean == pytest.approx(DEFAULT.answer_reliability * 5.0, abs=0.01)
    assert sub.basis.music == "none"
    assert sub.basis.answers == "direct"
    assert profile.layers.music is None
    assert profile.layers.answers == profile.preference_curve


def test_the_music_hypothesis_is_a_parameter() -> None:
    library = bass_heavy_music()
    content = dims(fuse(music=library, answers=None))["sub_bass"].mean
    none = dims(fuse(music=library, answers=None, params=DEFAULT.with_(music_correlation=0.0)))
    compensation = dims(
        fuse(music=library, answers=None, params=DEFAULT.with_(music_correlation=-0.5))
    )
    assert content > 0
    assert none["sub_bass"].mean == 0
    assert none["sub_bass"].music_value is None
    assert compensation["sub_bass"].mean < 0


def test_curve_range_spans_both_sources_and_the_credible_interval() -> None:
    profile = fuse(music=music(30, {"sub_bass": -14}), answers={"bass_amount": "5"})
    point = next(c for c in profile.preference_curve if c.band == "sub_bass")
    from_music = next(c for c in profile.layers.music or [] if c.band == "sub_bass")
    from_answers = next(c for c in profile.layers.answers or [] if c.band == "sub_bass")
    assert point.low_db <= from_music.offset_db < point.offset_db < from_answers.offset_db
    assert from_answers.offset_db <= point.high_db
    assert point.high_db - point.low_db >= 2 * 1.28 * point.sd_db - 0.02
    mids = next(c for c in profile.preference_curve if c.band == "mids")
    assert mids.reference
    assert mids.offset_db == 0


def test_unsure_answers_add_no_evidence() -> None:
    profile = dims(fuse(music=None, answers={"bass_amount": None, "vocals": "5"}))
    assert profile["sub_bass"].confidence == 0
    assert profile["vocal_presence"].value > 0.7


def test_bass_character_splits_sub_and_mid() -> None:
    rumble = dims(fuse(music=None, answers={"bass_amount": "4", "bass_character": "rumble"}))
    punch = dims(fuse(music=None, answers={"bass_amount": "4", "bass_character": "punch"}))
    assert rumble["sub_bass"].mean > rumble["mid_bass"].mean
    assert punch["mid_bass"].mean > punch["sub_bass"].mean


def test_treble_sensitivity_limits_the_curve() -> None:
    profile = fuse(music=None, answers={"treble_feel": "harsh"})
    d = dims(profile)
    assert d["treble_tolerance"].value < 0.3
    curve = {c.band: c.offset_db for c in profile.preference_curve}
    assert curve["lower_treble"] <= curve["upper_treble"] < 0
    assert any("sensitive to bright treble" in line for line in profile.summary)


def test_feedback_moves_the_needle() -> None:
    base = dims(fuse(music=None, answers={"bass_amount": "3"}))["sub_bass"].mean
    signals = [FeedbackSignal(dimension="sub_bass", direction=1)] * 3
    after = dims(fuse(music=None, answers={"bass_amount": "3"}, feedback=signals))["sub_bass"]
    assert after.mean > base
    assert fuse(music=None, answers=None, feedback=signals).sources["feedback"] is True


def test_values_are_population_percentiles() -> None:
    d = dims(fuse(music=None, answers={"bass_amount": "5"}))["sub_bass"]
    expected = 0.5 * (1 + math.erf(d.mean / DEFAULT.sd_bass_db / math.sqrt(2)))
    assert d.value == pytest.approx(expected, abs=0.001)


def test_assumptions_travel_with_the_profile() -> None:
    profile = fuse(music=None, answers=None)
    statuses = {a.key: a.status for a in profile.assumptions}
    assert statuses["music_correlation"] == "hypothesis"
    assert statuses["answer_reliability"] == "literature_informed"
    assert all(a.basis for a in profile.assumptions)


def test_every_answer_moves_its_dimension() -> None:
    answers = {q.id: q.options[-1].value for q in QUESTIONS}
    curve = {c.band: c.offset_db for c in fuse(music=None, answers=answers).preference_curve}
    assert curve["mids"] == 0
    assert curve["sub_bass"] > 2
    assert curve["upper_mids"] > 1


def test_validate_answers() -> None:
    clean = validate_answers({"bass_amount": "3"})
    assert clean["bass_amount"] == "3"
    assert clean["vocals"] is None
    with pytest.raises(AnswerError, match="unknown"):
        validate_answers({"favourite_colour": "blue"})
    with pytest.raises(AnswerError, match="invalid"):
        validate_answers({"bass_amount": "7"})
