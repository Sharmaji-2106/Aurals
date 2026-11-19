"""Relevance and query generation.

The interesting cases here are not invented. Every string marked "observed" is
text Reddrix actually returned for the query ``"Moondrop Aria" review`` against
live Reddit, including the failure that prompted the generation guard: four of
the first five results were about the *Aria 2*, a different earphone with a
different measurement.
"""

from auralis.research import queries
from auralis.research.relevance import (
    Product,
    body_fingerprint,
    judge,
    mentions,
    normalise,
    score_product,
)

ARIA = Product("moondrop-aria", "Moondrop", "Aria")
CHU = Product("moondrop-chu", "Moondrop", "Chu")
TRUTHEAR_NOVA = Product("truthear-nova", "Truthear", "Nova")
MOONDROP_NOVA = Product("moondrop-nova", "Moondrop", "Nova")
ZERO = Product("truthear-x-crinacle-zero", "Truthear", "Zero")
ZERO_RED = Product("truthear-x-crinacle-zero-red", "Truthear", "Zero RED")
TIN_T2 = Product("tin-hifi-t2", "Tin HiFi", "T2")

CATALOGUE = [ARIA, CHU, TRUTHEAR_NOVA, MOONDROP_NOVA, ZERO, ZERO_RED, TIN_T2]

LONG = " and here is enough prose to clear the minimum body length for a comment."


def verdict(title: str | None, body: str, *, target: Product = ARIA, comment: bool = False):
    return judge(
        title=title,
        body=body,
        subreddit="r/iems",
        is_comment=comment,
        target=target,
        catalogue=CATALOGUE,
    )


# --------------------------------------------------------------- normalising ---


def test_normalise_makes_model_punctuation_irrelevant() -> None:
    # "Zero:2", "Zero 2" and "zero-2" are the same name written three ways.
    assert normalise("Zero:2") == normalise("zero 2") == normalise("ZERO-2")


# ------------------------------------------------------- generation guarding ---


def test_observed_aria_2_review_is_not_evidence_about_the_aria() -> None:
    # Observed: the top result for '"Moondrop Aria" review'.
    v = verdict(
        "Moondrop Aria 2 - A Two Year Long-Term Review",
        "Two years ago I was choosing between the Moondrop Aria 2 and the Simgot EA500LM.",
    )
    assert not v.keep
    assert v.reason == "superseded_generation"


def test_observed_aria_thread_is_kept() -> None:
    # Observed, and genuinely about the Aria.
    v = verdict(
        "Replacing the Daily Beaters. Moondrop Aria > CrinEar Nightfall (First Impression Review)",
        "My Arias have lived a reasonably long life (2022) in my Uni bag, and with the paint "
        "starting to peel I felt like treating myself to something new.",
    )
    assert v.keep
    assert v.best_slug == "moondrop-aria"


def test_observed_unrelated_result_is_rejected() -> None:
    # Observed: the search returned a Chu III thread for an Aria query.
    v = verdict(
        "I recently got the CHU III and heres my first impressions", "Bass is punchy." + LONG
    )
    assert not v.keep
    assert v.reason in {"product_not_mentioned", "superseded_generation"}


def test_a_number_that_is_not_a_generation_still_counts() -> None:
    # "Aria 2 months ago" is a clean mention wearing a number. One clean
    # mention anywhere is enough, which is why mentions() counts both kinds.
    v = verdict(None, "I bought the Moondrop Aria 2 months ago and the Aria still impresses me.")
    assert v.keep


def test_mentions_separates_clean_from_superseded() -> None:
    hay = normalise("the aria 2 is warmer than the aria")
    assert mentions(hay, "aria") == (1, 1)


def test_pro_suffix_is_treated_as_a_different_product() -> None:
    v = verdict(
        None, "The Moondrop Aria Pro has a tighter low end than I expected from this price."
    )
    assert not v.keep
    assert v.reason == "superseded_generation"


# ------------------------------------------------- resolving product identity ---


def test_bare_weak_model_name_is_not_an_identification() -> None:
    # "Nova" alone cannot choose between two catalogue products.
    v = verdict(
        None, "The Nova is warmer than I expected for the money." + LONG, target=TRUTHEAR_NOVA
    )
    assert not v.keep


def test_brand_disambiguates_two_products_sharing_a_model_name() -> None:
    text = "The Truthear Nova has a cleaner midrange than I expected." + LONG
    assert verdict(None, text, target=TRUTHEAR_NOVA).keep
    kept_by_wrong_brand = verdict(None, text, target=MOONDROP_NOVA)
    assert not kept_by_wrong_brand.keep
    assert kept_by_wrong_brand.best_slug == "truthear-nova"


def test_more_specific_model_wins_a_shared_prefix() -> None:
    # "Zero RED" contains "Zero", so the longer name has to win or every RED
    # thread would be filed under the original Zero as well.
    text = "The Truthear Zero RED is bassier than the older one." + LONG
    assert verdict(None, text, target=ZERO_RED).keep
    assert not verdict(None, text, target=ZERO).keep


def test_multi_word_brand_is_matched_whole() -> None:
    v = verdict(None, "My Tin HiFi T2 still sounds good after years of use." + LONG, target=TIN_T2)
    assert v.keep


def test_full_phrase_scores_above_scattered_tokens() -> None:
    hay = normalise("the moondrop aria is good")
    apart = normalise("my aria, made by moondrop, is good")
    assert score_product(hay, ARIA).score > score_product(apart, ARIA).score


# ----------------------------------------------------------------- the floors ---


def test_a_one_line_comment_is_not_quotable() -> None:
    assert not verdict(None, "+1 for the Moondrop Aria", comment=True).keep


def test_comment_is_judged_with_its_post_title() -> None:
    # A comment saying only "the bass is too much" is about the Aria when the
    # post it sits under says so. This is how a reader reads it.
    v = verdict(
        "Moondrop Aria impressions",
        "The bass is too much for me, especially on electronic tracks where the sub-bass "
        "smears into the kick drum." + LONG,
        comment=True,
    )
    assert v.keep


def test_empty_text_is_rejected_without_crashing() -> None:
    assert not verdict(None, "   ").keep


# ------------------------------------------------------------- deduplication ---


def test_fingerprint_ignores_formatting_but_not_content() -> None:
    a = body_fingerprint("The bass   is\nwarm.")
    b = body_fingerprint("the bass is warm")
    assert a == b
    assert a != body_fingerprint("the treble is warm")


# ------------------------------------------------------------------- queries ---


def test_queries_pin_the_brand_and_model_as_one_phrase() -> None:
    out = queries.queries_for("Moondrop", "Aria", limit=2)
    assert len(out) == 2
    assert all('"Moondrop Aria"' in q for q in out)
    assert out[0] == '"Moondrop Aria" review'


def test_query_budget_is_respected() -> None:
    assert queries.queries_for("Moondrop", "Aria", limit=0) == []
    assert len(queries.queries_for("Moondrop", "Aria", limit=99)) == len(queries.TEMPLATES)


def test_queries_are_unique() -> None:
    out = queries.queries_for("Tin HiFi", "T2", limit=5)
    assert len(out) == len(set(out))
