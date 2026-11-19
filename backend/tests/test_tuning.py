"""The listening session: choice model, consistency, device, shapes, and the API."""

from __future__ import annotations

import numpy as np
import pytest

from auralis.tuning import simulate
from auralis.tuning.clip import best_part
from auralis.tuning.inference import (
    DEVICE_UNKNOWN_SD,
    SHAPE_SD,
    Belief,
    Choice,
    consistency,
    observations,
    probit_update,
)
from auralis.tuning.policy import REPEAT_AT, REPEAT_OF, TRIALS, Trial, next_trial, start


def test_a_choice_moves_the_belief_toward_the_side_picked_and_tightens_it() -> None:
    prior = Belief(0.0, 9.0)
    up = probit_update(prior, 0.0, 2.0, "plus", 8.0)
    down = probit_update(prior, 0.0, 2.0, "minus", 8.0)
    assert up.mean > 0 > down.mean
    assert up.var < prior.var
    assert down.var < prior.var
    same = probit_update(Belief(3.0, 9.0), 0.0, 2.0, "same", 8.0)
    assert 0 < same.mean < 3.0


def test_consistency_is_read_from_the_repeated_trial() -> None:
    base = {"dimension": "sub_bass", "center_db": 0.0, "delta_db": 2.0}
    first = Choice.parse({**base, "picked": "plus"})
    again = Choice.parse({**base, "picked": "plus", "repeat_of": 0})
    flipped = Choice.parse({**base, "picked": "minus", "repeat_of": 0})
    assert consistency([first])[0] == "untested"
    assert consistency([first, again]) == ("consistent", pytest.approx(0.8))
    assert consistency([first, flipped])[0] == "mixed"


def test_a_known_device_is_added_back_and_an_unknown_one_widens_the_evidence() -> None:
    choices = [{"dimension": "sub_bass", "center_db": 0.0, "delta_db": 2.0, "picked": "plus"}] * 3
    known = observations(
        shape=None, choices=choices, device_offsets={"sub_bass": 4.0}, device_label="X"
    )
    unknown = observations(shape=None, choices=choices, device_offsets=None)
    k = known["sub_bass"][0]
    u = unknown["sub_bass"][0]
    assert k.value == pytest.approx(u.value + 4.0)
    assert u.variance == pytest.approx(k.variance + DEVICE_UNKNOWN_SD**2)
    assert "on your X" in k.note


def test_the_shape_is_a_wide_nudge_on_every_tonal_dimension() -> None:
    obs = observations(shape="v_shaped", choices=[], device_offsets={})
    assert set(obs) == {"sub_bass", "mid_bass", "warmth", "vocal_presence", "treble", "air"}
    assert obs["sub_bass"][0].value > 0 > obs["vocal_presence"][0].value
    assert obs["treble"][0].variance == pytest.approx(SHAPE_SD**2)


def test_the_policy_plays_eight_trials_and_repeats_one_unannounced() -> None:
    beliefs = start("warm")
    history: list[Trial] = []
    while (trial := next_trial(beliefs, history)) is not None:
        history.append(trial)
    assert len(history) == TRIALS
    repeat = history[REPEAT_AT]
    assert repeat.repeat_of == REPEAT_OF
    assert (repeat.dimension, repeat.center_db, repeat.delta_db) == (
        history[REPEAT_OF].dimension,
        history[REPEAT_OF].center_db,
        history[REPEAT_OF].delta_db,
    )


def test_the_duel_recovers_a_simulated_listeners_preference() -> None:
    result = simulate.run(listeners=200, seed=3)
    assert result.reduction() > 0.25
    noisy = simulate.run(listeners=200, noise_factor=2.0, seed=3)
    assert noisy.reduction() > 0.15


def test_the_best_part_is_the_loudest_sustained_stretch() -> None:
    rate = 1000
    quiet = np.full(rate * 60, 0.05)
    quiet[rate * 30 : rate * 50] = 0.8  # a 20 s chorus at 30 s
    assert best_part(quiet, rate, seconds=20) == pytest.approx(30, abs=1.6)


def test_a_session_is_stored_and_shapes_the_sound_profile(client) -> None:  # type: ignore[no-untyped-def]
    assert client.post("/api/session", json={"display_name": "Duel"}).status_code == 201
    shapes = client.get("/api/tuning/shapes").json()
    assert {s["key"] for s in shapes} >= {"balanced", "v_shaped", "warm"}
    assert client.get("/api/tuning/clip").json()["status"] == "none"  # no music yet
    body = {
        "shape": "bass_heavy",
        "device_kind": "unknown",
        "choices": [
            {"dimension": "sub_bass", "center_db": 0, "delta_db": 3, "picked": "plus"},
            {"dimension": "sub_bass", "center_db": 2, "delta_db": 2, "picked": "plus"},
            {
                "dimension": "sub_bass",
                "center_db": 2,
                "delta_db": 2,
                "picked": "plus",
                "repeat_of": 1,
            },
        ],
    }
    out = client.post("/api/tuning/sessions", json=body)
    assert out.status_code == 201
    data = out.json()
    assert data["consistency"] == "consistent"
    dims = {d["key"]: d for d in data["sound_profile"]["data"]["dimensions"]}
    assert dims["sub_bass"]["mean"] > 1.0
    assert any(e["source"] == "listening" for e in dims["sub_bass"]["evidence"])
    assert client.get("/api/tuning/sessions/latest").json()["shape"] == "bass_heavy"
