"""Grouping retrieved quotes into topics and stances.

The community section promises three things: what owners appreciate, what they
criticise, and where they disagree. Getting there from raw Reddit text needs a
judgement about each passage — which aspect it concerns, and whether it reads
as praise, criticism or something mixed. The hand-gathered publication reviews
in ``data/reviews/`` record exactly that judgement, made by a person, and say
so: "Topic and stance are Auralis's reading of the quoted passage, not the
reviewer's own labels."

This module makes the same kind of judgement with a model instead of a person,
and is held to the same rules:

* **The quote is never touched.** The model receives text and returns labels.
  It does not write, summarise, correct or paraphrase anything that reaches the
  screen; the stored quote is the author's words, verbatim.
* **It may only narrow.** A passage the model cannot place, or that turns out
  not to be about the product, or that is a question rather than an
  impression, is discarded. It can never add a claim that no source made.
* **Provenance is visible.** Every claim is stored with
  ``tagged_by="llm/<model>"``, in the same column that reads
  ``"auralis-editorial"`` for the hand-made ones, and the API already exposes
  it. A reader can always tell which judgements were a person's.
* **It is nowhere near the ranking.** Recommendations come from measured
  frequency response against the listener's target. Nothing here is an input
  to that, before or after.

Without an API key the module reports that it cannot label, and the run stores
its sources unlabelled rather than guessing.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Final, Literal

from pydantic import BaseModel, Field

from auralis.config import get_settings
from auralis.research import google_llm
from auralis.reviews.models import TOPICS

log = logging.getLogger(__name__)

Topic = Literal["bass", "vocals", "treble", "detail", "soundstage", "fit", "isolation", "build"]
Stance = Literal["positive", "negative", "mixed"]

#: Quotes per request. Batched because one call per quote would be dozens of
#: round trips for a single earphone; small enough that one malformed reply
#: costs little.
BATCH_SIZE: Final = 10
MAX_TOKENS: Final = 2048

SYSTEM: Final = f"""\
You classify short passages that people wrote about in-ear monitors on Reddit.

You are given numbered passages and the earphone under discussion. For each
passage, decide:

- about_product: does this passage say something about THAT earphone? False if
  it is about a different product, about sources/amps/cables only, or if the
  earphone is merely named in passing with nothing said about it.
- is_impression: does it report the writer's own listening or ownership
  experience? False for questions ("is it better than X?"), requests for
  recommendations, price talk, and availability chatter.
- topic: which single aspect it most concerns, from exactly this list:
{chr(10).join(f"  {k}: {v}" for k, v in TOPICS.items())}
- stance: positive, negative, or mixed. Use mixed for genuine qualification
  ("good but not for everyone"), not as a hedge when you are unsure.

Rules you must follow:
- Classify only. Never rewrite, summarise, translate or correct a passage.
- Never infer a measurement, specification or fact that the passage does not
  state.
- If a passage does not clearly fit a topic, set about_product false rather
  than forcing it into the nearest one. Discarding is always acceptable;
  guessing is not.
- Return exactly one entry per passage, with its given index.
"""


class QuoteLabel(BaseModel):
    """One passage's classification."""

    index: int = Field(description="The passage number given in the prompt.")
    about_product: bool
    is_impression: bool
    topic: Topic
    stance: Stance


class LabelBatch(BaseModel):
    labels: list[QuoteLabel]


@dataclass(frozen=True, slots=True)
class Labelled:
    """A quote that survived labelling, with where it came from."""

    source_index: int
    quote: str
    topic: str
    stance: str
    tagged_by: str


class LabellingUnavailable(Exception):
    """Labelling cannot run. The run continues and records why."""

    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


STANCES: Final = ["positive", "negative", "mixed"]


def provider() -> Literal["google", "anthropic", "none"]:
    """Which provider will label, given the keys and the preference.

    ``auto`` prefers Google when its key is present. Not a judgement about the
    models: it is the key this installation has, and preferring a provider that
    is not configured would mean the feature silently does nothing.
    """
    settings = get_settings()
    choice = settings.llm_provider
    if choice == "none":
        return "none"
    if choice == "google":
        return "google" if settings.google_api_key else "none"
    if choice == "anthropic":
        return "anthropic" if settings.anthropic_api_key else "none"
    if settings.google_api_key:
        return "google"
    return "anthropic" if settings.anthropic_api_key else "none"


def available() -> bool:
    return provider() != "none"


def _models(settings: object) -> list[str]:
    """The chain to try, primary first, with blanks and duplicates removed."""
    primary = getattr(settings, "google_model", "")
    rest = getattr(settings, "google_fallback_models", "") or ""
    names = [primary, *(part.strip() for part in rest.split(","))]
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


def _label_with_google(quotes: list[str], *, product: str) -> list[Labelled]:
    settings = get_settings()
    key = settings.google_api_key
    assert key is not None  # `provider()` already established this
    out: list[Labelled] = []

    for start in range(0, len(quotes), BATCH_SIZE):
        chunk = quotes[start : start + BATCH_SIZE]
        numbered = "\n\n".join(f"[{i}] {q}" for i, q in enumerate(chunk))
        try:
            labels, model = google_llm.classify(
                system=SYSTEM,
                user=f"Earphone under discussion: {product}\n\n{numbered}",
                topics=list(TOPICS),
                stances=STANCES,
                api_key=key.get_secret_value(),
                models=_models(settings),
                max_tokens=MAX_TOKENS,
            )
        except google_llm.GoogleUnavailable as exc:
            # One bad batch must not lose the batches that worked.
            log.warning("labelling batch at %d failed: %s", start, exc)
            continue

        for item in labels:
            out.extend(_keep(item, chunk=chunk, start=start, model=model))

    return out


def _keep(item: dict[str, object], *, chunk: list[str], start: int, model: str) -> list[Labelled]:
    """Admit one label, or nothing.

    Every gate here is a narrowing. A passage that is not about the product,
    is not an impression, or carries a topic outside the vocabulary is dropped
    rather than coerced into the nearest category — the model may only ever
    remove quotes from consideration, never add a claim.
    """
    index = item.get("index")
    if not isinstance(index, int) or not (0 <= index < len(chunk)):
        return []
    if not item.get("about_product") or not item.get("is_impression"):
        return []
    topic = item.get("topic")
    stance = item.get("stance")
    if topic not in TOPICS or stance not in STANCES:
        return []
    return [
        Labelled(
            source_index=start + index,
            quote=chunk[index],
            topic=str(topic),
            stance=str(stance),
            tagged_by=f"llm/{model}",
        )
    ]


def label(quotes: list[str], *, product: str) -> list[Labelled]:
    """Classify ``quotes`` about ``product``, dropping what does not qualify.

    The returned list is usually shorter than the input — that is the point.
    ``source_index`` maps each label back to its quote so the caller can keep
    the source it came from.
    """
    chosen = provider()
    if chosen == "none":
        raise LabellingUnavailable(
            "No LLM API key is configured, so quotes cannot be grouped by topic.",
            code="llm_not_configured",
        )
    if not quotes:
        return []
    if chosen == "google":
        return _label_with_google(quotes, product=product)

    settings = get_settings()
    key = settings.anthropic_api_key
    assert key is not None  # `provider()` already established this

    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - depends on the install
        raise LabellingUnavailable(
            "The anthropic package is not installed.", code="llm_missing"
        ) from exc

    client = anthropic.Anthropic(api_key=key.get_secret_value())
    model = settings.llm_model
    out: list[Labelled] = []

    for start in range(0, len(quotes), BATCH_SIZE):
        chunk = quotes[start : start + BATCH_SIZE]
        numbered = "\n\n".join(f"[{i}] {q}" for i, q in enumerate(chunk))
        try:
            response = client.messages.parse(
                model=model,
                max_tokens=MAX_TOKENS,
                # The system prompt never varies, so it caches across every
                # batch and every run.
                system=[
                    {
                        "type": "text",
                        "text": SYSTEM,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                output_config={"effort": "low"},
                messages=[
                    {
                        "role": "user",
                        "content": f"Earphone under discussion: {product}\n\n{numbered}",
                    }
                ],
                output_format=LabelBatch,
            )
        except anthropic.APIError as exc:
            # One bad batch must not lose the batches that worked.
            log.warning("labelling batch at %d failed: %s", start, exc)
            continue

        parsed = response.parsed_output
        if parsed is None:
            log.warning("labelling batch at %d returned nothing parseable", start)
            continue

        for item in parsed.labels:
            if not (0 <= item.index < len(chunk)):
                continue
            if not item.about_product or not item.is_impression:
                continue
            # Belt and braces: the schema constrains these, but a stored claim
            # with an unknown topic would break the topic tally downstream.
            if item.topic not in TOPICS:
                continue
            out.append(
                Labelled(
                    source_index=start + item.index,
                    quote=chunk[item.index],
                    topic=item.topic,
                    stance=item.stance,
                    tagged_by=f"llm/{model}",
                )
            )

    return out
