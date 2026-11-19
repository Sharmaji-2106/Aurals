"""The sound shapes reviewers talk about, pinned down as curves.

"V-shaped", "warm", "bright" are the vocabulary people meet in every IEM review,
but they are defined loosely and against different references. Here each one is
a fixed set of offsets, in dB, from the Harman in-ear 2019 target, on the six
tonal dimensions of the sound profile — so a word means one thing on AURALS, and
the listener can hear it.

The offsets are design choices (heuristic): they follow the usual descriptions
(a V lifts both ends and sinks the mids; a U is a gentler V; warm leans on the low
mids) at moderate depths. They are a starting point for the tuning duel, and enter
the profile only as weak evidence.
"""

from __future__ import annotations

from typing import Final

from pydantic import BaseModel

TONAL: Final = ("sub_bass", "mid_bass", "warmth", "vocal_presence", "treble", "air")


class Shape(BaseModel):
    key: str
    label: str
    blurb: str
    offsets: dict[str, float]


def _shape(key: str, label: str, blurb: str, *db: float) -> Shape:
    return Shape(key=key, label=label, blurb=blurb, offsets=dict(zip(TONAL, db, strict=True)))


SHAPES: Final[tuple[Shape, ...]] = (
    _shape(
        "balanced",
        "Balanced",
        "The research reference: what most listeners prefer.",
        0,
        0,
        0,
        0,
        0,
        0,
    ),
    _shape(
        "warm", "Warm", "Full and smooth: rich low mids, softer highs.", 2, 2, 2.5, 0, -1.5, -1.5
    ),
    _shape(
        "u_shaped",
        "U-shaped",
        "A gentle lift at both ends; mids stay present.",
        3,
        2,
        0,
        -1,
        2,
        1.5,
    ),
    _shape(
        "v_shaped",
        "V-shaped",
        "Big bass and sparkle, mids pulled back. Exciting.",
        5,
        3.5,
        -1,
        -3,
        3,
        2.5,
    ),
    _shape(
        "bright",
        "Bright",
        "Crisp and detailed: leaner bass, lifted highs.",
        -1.5,
        -1,
        -0.5,
        1,
        3,
        3,
    ),
    _shape(
        "bass_heavy",
        "Bass-heavy",
        "Deep, physical low end; the rest stays even.",
        7,
        4.5,
        1,
        0,
        -0.5,
        -0.5,
    ),
    _shape(
        "vocal",
        "Vocal-forward",
        "Voices up front: present mids, calm ends.",
        -1,
        -1,
        0.5,
        3,
        0,
        -0.5,
    ),
)

BY_KEY: Final = {s.key: s for s in SHAPES}
