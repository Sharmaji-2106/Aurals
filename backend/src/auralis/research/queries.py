"""Turning an earphone into the searches worth running for it.

Two constraints shape this. The first is accuracy: a bare model name finds the
wrong product, so every query pins the brand and model together as a quoted
phrase and lets ``relevance`` do the rest. The second is cost — a single search
against the live provider takes roughly 23 seconds, measured, which means the
budget is two or three queries per earphone, not the half-dozen you would write
if they were free. They are therefore ordered by how much owner experience they
tend to return, and the caller takes the first ``limit``.
"""

from __future__ import annotations

import re
from typing import Final

#: Ordered by yield. "review" finds long write-ups; the listening-quality terms
#: find the comment threads where people say what they actually hear; "worth it"
#: finds the arguments, which is where disagreement lives.
TEMPLATES: Final[tuple[str, ...]] = (
    "{name} review",
    "{name} bass treble vocals",
    "{name} worth it impressions",
    "{name} long term",
    "{name} comparison",
)

MAX_QUERY_CHARS: Final = 120


def display_name(brand: str, model: str) -> str:
    """The name a person would type. Collapses whitespace, keeps the words."""
    joined = f"{brand} {model}".strip()
    return re.sub(r"\s+", " ", joined)


def quoted_name(brand: str, model: str) -> str:
    """The name as a quoted phrase, so the provider matches it as a unit.

    Double quotes inside a product name would break the phrase, so they are
    dropped rather than escaped — no catalogue entry depends on one.
    """
    return f'"{display_name(brand, model).replace(chr(34), "")}"'


def queries_for(brand: str, model: str, *, limit: int = 2) -> list[str]:
    """The searches to run for one earphone, best first.

    ``limit`` is a real budget, not a suggestion: each query is a round trip to
    the provider and the listener is waiting.
    """
    if limit <= 0:
        return []
    name = quoted_name(brand, model)
    out: list[str] = []
    for template in TEMPLATES:
        query = template.format(name=name)
        if len(query) > MAX_QUERY_CHARS:
            # A name long enough to blow the budget still deserves the plain
            # phrase search, which is the one that matters most.
            query = name
        if query not in out:
            out.append(query)
        if len(out) >= limit:
            break
    return out
