"""Does the whole journey end on proper earphones? Personas, run through the real engine.

Each persona is what a listener would actually tell AURALS — questionnaire
answers, genres and a budget, no music — fused and ranked exactly as the site
does. The report shows the top five, each earphone's measured match and
standing, and which of them published roundups recommend
(``data/iem/acclaim.json``), so a change to the engine can be judged on whether
real listeners would get real, buyable, well-regarded earphones.

    uv run --no-sync auralis personas
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from auralis.db import session_scope
from auralis.recommend.base import Constraints
from auralis.recommend.service import RecommendationsOut, recommend
from auralis.recommend.standing import acclaim
from auralis.sound_profile.fusion import fuse


@dataclass(frozen=True)
class Persona:
    name: str
    answers: dict[str, str | None]
    genres: tuple[str, ...]
    budget: int


PERSONAS: tuple[Persona, ...] = (
    Persona(
        "Hip-hop head, warm and bass-first, under ₹10k",
        {
            "bass_amount": "5",
            "bass_character": "rumble",
            "vocals": "3",
            "treble_feel": "harsh",
            "tone": "1",
        },
        ("hip_hop",),
        10_000,
    ),
    Persona(
        "Hip-hop on a starter budget, under ₹5k",
        {
            "bass_amount": "4",
            "bass_character": "both",
            "vocals": "3",
            "treble_feel": "sometimes",
            "tone": "2",
        },
        ("hip_hop",),
        5_000,
    ),
    Persona(
        "Pop and Bollywood all-rounder, under ₹10k",
        {
            "bass_amount": "3",
            "bass_character": "both",
            "vocals": "4",
            "treble_feel": "fine",
            "tone": "3",
        },
        ("pop", "bollywood"),
        10_000,
    ),
    Persona(
        "Detail lover, classical and jazz, under ₹10k",
        {
            "bass_amount": "2",
            "bass_character": "punch",
            "vocals": "3",
            "treble_feel": "sparkle",
            "tone": "4",
        },
        ("classical", "jazz_acoustic"),
        10_000,
    ),
    Persona(
        "Rock and metal, under ₹20k",
        {
            "bass_amount": "3",
            "bass_character": "punch",
            "vocals": "3",
            "treble_feel": "fine",
            "tone": "3",
        },
        ("rock_metal",),
        20_000,
    ),
)


def run(persona: Persona) -> RecommendationsOut:
    profile = fuse(
        music=None, answers=persona.answers, genres=persona.genres, primary_genre=persona.genres[0]
    )
    constraints = Constraints(
        budget_min=Decimal(0), budget_max=Decimal(persona.budget), currency="INR"
    )
    with session_scope() as db:
        return recommend(db, profile, constraints, limit=5)


def main() -> None:
    praised = acclaim()
    hits = 0
    for persona in PERSONAS:
        out = run(persona)
        print(f"\n{persona.name}")
        for rec in out.items:
            st = rec.standing
            named = ", ".join(m.publisher for m in st.mentions) if st and st.mentions else ""
            hits += bool(rec.slug in praised)
            price = f"₹{rec.price.amount:,.0f}" if rec.price else "no price"
            print(
                f"  {rec.rank}. {rec.brand} {rec.model:<28} {price:>9}  "
                f"match {rec.predicted_preference.mean:5.1f}"
                f"  +{st.points if st else 0:.1f} standing  {named}"
            )
    total = sum(1 for _ in PERSONAS) * 5
    print(f"\nPublished picks among the top fives: {hits} of {total}")


if __name__ == "__main__":
    main()
