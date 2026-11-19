"""Deciding whether a discussion is actually about the earphone we asked about.

This is the part that keeps the community section honest. A thread that says
"the Nova is warmer than I expected" might be about the Truthear Nova, the
Moondrop Nova or neither, and filing it under the wrong one would attribute a
real person's opinion to a product they never heard.

So nothing is accepted on a bare model name. A discussion is kept only when the
earphone we asked about is the *best* match in the whole catalogue — if some
other product matches the text more specifically, the discussion belongs to
that product and is rejected here.

Everything in this module is a pure function over text. No network, no
database, no model: the rules are inspectable and the tests pin them down.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

# Communities where IEM discussion is the point. Membership raises confidence;
# it never restricts the search, because useful threads live elsewhere too.
PREFERRED_SUBREDDITS: Final[frozenset[str]] = frozenset(
    {
        "inearfidelity",
        "iems",
        "headphones",
        "headphoneadvice",
        "audiophile",
        "budgetaudiophile",
        "chifi",
        "headphonesforsale",
    }
)

# Model names that are ordinary words carry almost no identifying weight on
# their own. These never satisfy identification without the brand present.
WEAK_MODEL_WORDS: Final[frozenset[str]] = frozenset(
    {
        "air",
        "aria",
        "blessing",
        "classic",
        "dusk",
        "elite",
        "free",
        "hex",
        "light",
        "mini",
        "nova",
        "one",
        "orchestra",
        "origin",
        "plus",
        "pro",
        "quartet",
        "solo",
        "studio",
        "summit",
        "timeless",
        "two",
        "ultra",
        "universe",
        "vision",
        "zero",
    }
)

# Tokens that turn a model name into a different product when they follow it.
# "Moondrop Aria" and "Moondrop Aria 2" are two earphones with two measurements,
# and a review of the second is not evidence about the first.
GENERATION_MARKERS: Final[frozenset[str]] = frozenset(
    {
        "ii",
        "iii",
        "iv",
        "lite",
        "max",
        "mk",
        "mkii",
        "plus",
        "pro",
        "se",
        "snow",
        "ultra",
    }
)

# A comment shorter than this says nothing worth quoting ("+1", "same", "this").
MIN_COMMENT_CHARS: Final = 80
MIN_POST_CHARS: Final = 40

# Below this, the text does not identify the product well enough to keep.
KEEP_THRESHOLD: Final = 0.55


@dataclass(frozen=True, slots=True)
class Product:
    """A catalogue entry, as little of it as identification needs."""

    slug: str
    brand: str
    model: str


@dataclass(frozen=True, slots=True)
class Match:
    """How well one product is identified by a piece of text."""

    product: Product
    score: float
    #: Characters of the longest phrase that matched. Longer is more specific,
    #: so "Zero RED" beats "Zero" when both appear.
    specificity: int
    #: The name appeared, but every time it was followed by a generation marker
    #: ("Aria 2"), so the text is about a later product. Distinguished from
    #: "never mentioned" so the rejection can say which it was.
    superseded: bool = False


@dataclass(frozen=True, slots=True)
class Verdict:
    keep: bool
    score: float
    reason: str
    #: The product the text actually looks like it is about, when that differs.
    best_slug: str | None = None


def normalise(text: str) -> str:
    """Lowercase, strip punctuation to spaces, collapse runs of whitespace.

    Keeps digits and letters only, so "Zero:2", "Zero 2" and "zero-2" compare
    equal — model naming in this category is not consistent enough to trust.
    """
    lowered = text.casefold()
    cleaned = re.sub(r"[^a-z0-9]+", " ", lowered)
    return f" {cleaned.strip()} "


def _phrase(text: str) -> str:
    """A normalised phrase ready for substring search inside ``normalise`` output."""
    return normalise(text).strip()


def _is_generation_marker(token: str) -> bool:
    return token.isdigit() or token in GENERATION_MARKERS


def mentions(haystack: str, model: str) -> tuple[int, int]:
    """Count mentions of ``model`` as ``(clean, superseded)``.

    A *superseded* mention is one immediately followed by a generation marker,
    so the text names a later model than the one asked about. The two are
    counted separately rather than one disqualifying the other, because
    "I bought the Aria 2 months ago" is a clean mention of the Aria wearing a
    number, while "the Aria 2 sounds warmer" is not a mention of the Aria at
    all. Only text whose every mention is superseded gets rejected.
    """
    needle = f" {model} "
    if not model:
        return (0, 0)
    clean = superseded = 0
    start = 0
    while True:
        at = haystack.find(needle, start)
        if at < 0:
            return (clean, superseded)
        after = haystack[at + len(needle) - 1 :].strip().split(" ", 1)
        nxt = after[0] if after and after[0] else ""
        if nxt and _is_generation_marker(nxt):
            superseded += 1
        else:
            clean += 1
        # Step forward by one character so overlapping mentions still register.
        start = at + 1


def score_product(haystack: str, product: Product) -> Match:
    """How strongly ``haystack`` identifies ``product``.

    ``haystack`` must already be ``normalise``d. The scale is deliberately
    coarse — this is identification, not ranking.
    """
    brand = _phrase(product.brand)
    model = _phrase(product.model)
    full = f"{brand} {model}".strip()

    has_brand = bool(brand) and f" {brand} " in haystack
    full_clean, full_superseded = mentions(haystack, full)
    model_clean, model_superseded = mentions(haystack, model)

    if full_clean:
        # Brand and model together, in order. Nothing identifies better.
        return Match(product, 1.0, len(full))
    if model_clean and has_brand:
        # Both present but apart — normal in prose ("my Aria from Moondrop").
        return Match(product, 0.85, len(model) + len(brand))
    if model_clean:
        weak = model in WEAK_MODEL_WORDS or len(model) <= 2
        # A bare ordinary word is not an identification.
        return Match(product, 0.25 if weak else 0.6, len(model))
    if full_superseded or model_superseded:
        # Every mention named a later generation. The text is about a different
        # earphone, so this is not weak evidence — it is the wrong product.
        return Match(product, 0.0, 0, superseded=True)
    return Match(product, 0.0, 0)


def best_match(haystack: str, catalogue: Iterable[Product]) -> Match | None:
    """The product the text identifies most specifically, if any."""
    best: Match | None = None
    for product in catalogue:
        match = score_product(haystack, product)
        if match.score <= 0:
            continue
        if (
            best is None
            or match.score > best.score
            or (match.score == best.score and match.specificity > best.specificity)
        ):
            best = match
    return best


def judge(
    *,
    title: str | None,
    body: str,
    subreddit: str,
    is_comment: bool,
    target: Product,
    catalogue: Iterable[Product],
) -> Verdict:
    """Decide whether this discussion is usable evidence about ``target``.

    A comment is judged on the post's title as well as its own text, because
    that is how a reader understands it: a comment saying "the bass is too much
    for me" under a post titled "Moondrop Aria impressions" is about the Aria.
    """
    text = " ".join(part for part in (title, body) if part)
    if not text.strip():
        return Verdict(False, 0.0, "empty")

    floor = MIN_COMMENT_CHARS if is_comment else MIN_POST_CHARS
    if len(body.strip()) < floor:
        return Verdict(False, 0.0, "too_short")

    haystack = normalise(text)
    mine = score_product(haystack, target)
    if mine.score <= 0:
        reason = "superseded_generation" if mine.superseded else "product_not_mentioned"
        return Verdict(False, 0.0, reason)

    # The decisive rule: if another catalogue entry is identified more
    # specifically, this text is about that one, not ours.
    overall = best_match(haystack, catalogue)
    if overall is not None and overall.product.slug != target.slug:
        more_specific = overall.score > mine.score or (
            overall.score == mine.score and overall.specificity > mine.specificity
        )
        if more_specific:
            return Verdict(False, mine.score, "other_product_matches_better", overall.product.slug)

    score = mine.score
    if subreddit.casefold().removeprefix("r/") in PREFERRED_SUBREDDITS:
        score = min(1.0, score + 0.1)

    if score < KEEP_THRESHOLD:
        return Verdict(False, score, "weak_identification", target.slug)
    return Verdict(True, score, "ok", target.slug)


def body_fingerprint(body: str) -> str:
    """A stable hash of a discussion's text, for catching reposts and echoes.

    Reddit threads quote each other constantly; two sources carrying identical
    text are one piece of evidence, not two, and counting them twice would
    overstate agreement.
    """
    return hashlib.sha256(normalise(body).encode()).hexdigest()[:32]
