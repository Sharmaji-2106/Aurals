"""The perceptual questionnaire, defined once and served to the client.

Questions use listener language, never engineering terms. Every question can be
answered "not sure", which is stored as ``None`` and contributes no evidence.
Changing questions or their meaning requires a new QUESTIONNAIRE_VERSION.
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import BaseModel

QUESTIONNAIRE_VERSION: Final = "perceptual/1"


class QuestionOption(BaseModel):
    value: str
    label: str
    hint: str | None = None


class Question(BaseModel):
    id: str
    kind: Literal["scale", "choice"]
    prompt: str
    help: str | None = None
    options: list[QuestionOption]
    # For scales: labels for the two ends, shown under the control.
    low_label: str | None = None
    high_label: str | None = None
    visual: str | None = None  # a hint for the client's illustration


class Questionnaire(BaseModel):
    version: str
    questions: list[Question]


def _scale(labels: list[str]) -> list[QuestionOption]:
    return [QuestionOption(value=str(i + 1), label=label) for i, label in enumerate(labels)]


QUESTIONS: Final[list[Question]] = [
    Question(
        id="bass_amount",
        kind="scale",
        prompt="How much bass do you enjoy?",
        help="Think of the kick drum and bass line in your favourite songs.",
        options=_scale(["Just a hint", "Light", "Balanced", "Generous", "Big and physical"]),
        low_label="Subtle",
        high_label="Physical",
        visual="bass",
    ),
    Question(
        id="bass_character",
        kind="choice",
        prompt="When the bass hits, what do you want to feel?",
        options=[
            QuestionOption(
                value="rumble", label="Deep rumble", hint="The low, felt-more-than-heard layer"
            ),
            QuestionOption(
                value="punch", label="Punch and thump", hint="Tight kick drums you can hear"
            ),
            QuestionOption(value="both", label="Both equally"),
        ],
        visual="bass_character",
    ),
    Question(
        id="vocals",
        kind="scale",
        prompt="Where should vocals sit?",
        help="Imagine the singer on a stage in front of the band.",
        options=_scale(
            ["Blended in", "Slightly back", "Natural", "Clearly forward", "Front and centre"]
        ),
        low_label="Part of the mix",
        high_label="Right in front of you",
        visual="vocals",
    ),
    Question(
        id="treble_feel",
        kind="choice",
        prompt="Cymbals, “s” sounds and bright highs usually feel…",
        options=[
            QuestionOption(value="harsh", label="Often harsh or tiring"),
            QuestionOption(value="sometimes", label="Sometimes a bit much"),
            QuestionOption(value="fine", label="Usually fine"),
            QuestionOption(value="sparkle", label="Great: I like them crisp and sparkly"),
        ],
        visual="treble",
    ),
    Question(
        id="tone",
        kind="scale",
        prompt="Which way does your ideal sound lean?",
        options=_scale(
            ["Warm and smooth", "A little warm", "Neutral", "A little crisp", "Clean and crisp"]
        ),
        low_label="Warm, smooth",
        high_label="Clean, crisp",
        visual="tone",
    ),
    Question(
        id="energy",
        kind="scale",
        prompt="Relaxed or energetic?",
        help="How you want music to feel over a long listening session.",
        options=_scale(["Very relaxed", "Relaxed", "In between", "Lively", "Very energetic"]),
        low_label="Laid-back",
        high_label="Exciting",
        visual="energy",
    ),
    Question(
        id="detail",
        kind="scale",
        prompt="How much do you care about hearing every small detail?",
        options=_scale(["Not much", "A little", "Somewhat", "A lot", "It's essential"]),
        low_label="Just the music",
        high_label="Every breath and texture",
        visual="detail",
    ),
    Question(
        id="soundstage",
        kind="scale",
        prompt="How important is a wide, spacious sound?",
        options=_scale(["Not important", "Slightly", "Somewhat", "Very", "Essential"]),
        low_label="Intimate is fine",
        high_label="Wide and open",
        visual="soundstage",
    ),
    Question(
        id="naturalness",
        kind="scale",
        prompt="How important is it that instruments sound true to life?",
        options=_scale(["Not important", "Slightly", "Somewhat", "Very", "Essential"]),
        low_label="Fun over accuracy",
        high_label="Real instruments, real voices",
        visual="naturalness",
    ),
]

QUESTIONNAIRE: Final = Questionnaire(version=QUESTIONNAIRE_VERSION, questions=QUESTIONS)
QUESTIONS_BY_ID: Final = {q.id: q for q in QUESTIONS}


class AnswerError(ValueError):
    pass


def validate_answers(answers: dict[str, str | None]) -> dict[str, str | None]:
    """Unknown ids or values are errors; missing questions count as "not sure"."""
    unknown = set(answers) - set(QUESTIONS_BY_ID)
    if unknown:
        raise AnswerError(f"unknown question(s): {', '.join(sorted(unknown))}")
    clean: dict[str, str | None] = {}
    for q in QUESTIONS:
        value = answers.get(q.id)
        if value is not None and value not in {o.value for o in q.options}:
            raise AnswerError(f"invalid answer for {q.id}")
        clean[q.id] = value
    return clean
