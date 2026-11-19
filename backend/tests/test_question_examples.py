"""The questionnaire's examples: a fitting song per question, at its fitting moment."""

from __future__ import annotations

import uuid

import numpy as np

from auralis.music.models import Track
from auralis.tuning.examples import FOCUS, choose_songs, focus_part

RATE = 22_050


def _track(name: str) -> Track:
    return Track(id=uuid.uuid4(), source="youtube", source_id=name, title=name, channel="x")


def test_each_question_gets_its_own_showcase_song() -> None:
    bassy, vocal, bright, plain = (_track(n) for n in ("bassy", "vocal", "bright", "plain"))
    scores = {
        str(bassy.id): {
            "bass_amount": 9.0,
            "bass_character": 9.0,
            "vocals": -2.0,
            "treble_feel": -9.0,
        },
        str(vocal.id): {
            "bass_amount": 0.0,
            "bass_character": 0.0,
            "vocals": 6.0,
            "treble_feel": -3.0,
        },
        str(bright.id): {
            "bass_amount": -4.0,
            "bass_character": -4.0,
            "vocals": 1.0,
            "treble_feel": 2.0,
        },
        str(plain.id): {
            "bass_amount": 1.0,
            "bass_character": 1.0,
            "vocals": 0.0,
            "treble_feel": -5.0,
        },
    }
    chosen = choose_songs([plain, bright, vocal, bassy], scores)
    assert chosen["bass_amount"] is bassy
    assert chosen["vocals"] is vocal
    assert chosen["treble_feel"] is bright
    # The second bass question takes the next-best bass song, not the same one again.
    assert chosen["bass_character"] is plain
    assert set(chosen) == set(FOCUS)


def test_a_short_playlist_reuses_songs_rather_than_skipping_questions() -> None:
    only = _track("only")
    chosen = choose_songs([only], {str(only.id): {q: 0.0 for q in FOCUS if FOCUS[q]}})
    assert set(chosen) == set(FOCUS)
    assert all(t is only for t in chosen.values())


def test_the_bass_example_starts_where_the_bass_comes_in() -> None:
    # 60 s: a mid-heavy song whose heavy bass section runs from 30 s to 50 s.
    t = np.arange(60 * RATE) / RATE
    mono = 0.2 * np.sin(2 * np.pi * 1200 * t)
    drop = (t >= 30) & (t < 50)
    mono[drop] += 0.6 * np.sin(2 * np.pi * 55 * t[drop])
    start = focus_part(mono, RATE, FOCUS["bass_amount"])
    assert 28.0 <= start <= 36.0


def test_the_treble_example_finds_the_bright_stretch() -> None:
    t = np.arange(60 * RATE) / RATE
    mono = 0.3 * np.sin(2 * np.pi * 300 * t)
    rng = np.random.default_rng(1)
    hats = (t >= 8) & (t < 26)
    noise = rng.normal(0, 1, hats.sum())
    # Crude high-pass: differencing white noise tilts it toward the top end.
    mono[hats] += 0.15 * np.concatenate([[0.0], np.diff(noise)])
    start = focus_part(mono, RATE, FOCUS["treble_feel"])
    assert 6.0 <= start <= 13.0
