"""Labelling with Google, and what happens when a model will not answer.

The fallback chain is the part of this that is easiest to get wrong and
hardest to notice: a client with one model name works perfectly until the day
that model is busy or retired, and then quietly loses a run's labelling. These
tests fail if the chain stops being a chain.

Every call here is stubbed. Nothing in the suite talks to Google.
"""

from __future__ import annotations

import json
import urllib.error
from io import BytesIO
from typing import Any

import pytest

from auralis.research import google_llm, insights


def _reply(labels: list[dict[str, Any]]) -> dict[str, Any]:
    return {"candidates": [{"content": {"parts": [{"text": json.dumps({"labels": labels})}]}}]}


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://example.invalid", code=code, msg="nope", hdrs=None, fp=BytesIO(b"{}")
    )


LABEL = {
    "index": 0,
    "about_product": True,
    "is_impression": True,
    "topic": "bass",
    "stance": "positive",
}


def classify(models: list[str]) -> tuple[list[dict[str, Any]], str]:
    return google_llm.classify(
        system="s",
        user="u",
        topics=["bass", "treble"],
        stances=["positive", "negative", "mixed"],
        api_key="k",
        models=models,
        max_tokens=64,
    )


def test_the_first_model_that_answers_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google_llm, "_post", lambda model, key, body: _reply([LABEL]))
    labels, model = classify(["first", "second"])
    assert model == "first"
    assert labels == [LABEL]


def test_a_busy_model_falls_through_to_the_next(monkeypatch: pytest.MonkeyPatch) -> None:
    """503 is what a free tier actually returns, per model, under load."""
    seen: list[str] = []

    def post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
        seen.append(model)
        if model != "third":
            raise _http_error(503)
        return _reply([LABEL])

    monkeypatch.setattr(google_llm, "_post", post)
    labels, model = classify(["first", "second", "third"])
    assert seen == ["first", "second", "third"]
    assert model == "third"
    assert labels == [LABEL]


def test_a_retired_model_falls_through(monkeypatch: pytest.MonkeyPatch) -> None:
    """404 is what a model that has been withdrawn returns, which happens."""

    def post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
        if model == "retired":
            raise _http_error(404)
        return _reply([LABEL])

    monkeypatch.setattr(google_llm, "_post", post)
    _, model = classify(["retired", "current"])
    assert model == "current"


def test_a_rejected_request_does_not_walk_the_whole_chain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 400 is our request, not their capacity: the next model would say the
    same thing, so hammering the list only wastes the quota."""
    tried: list[str] = []

    def post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
        tried.append(model)
        raise _http_error(400)

    monkeypatch.setattr(google_llm, "_post", post)
    with pytest.raises(google_llm.GoogleUnavailable) as caught:
        classify(["first", "second", "third"])
    assert tried == ["first"]
    assert caught.value.code == "llm_failed"


def test_an_unreadable_reply_is_not_trusted(monkeypatch: pytest.MonkeyPatch) -> None:
    """A reply that does not parse gets the next model a turn, rather than
    this one the benefit of the doubt."""

    def post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
        if model == "garbled":
            return {"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}
        return _reply([LABEL])

    monkeypatch.setattr(google_llm, "_post", post)
    _, model = classify(["garbled", "sound"])
    assert model == "sound"


def test_when_every_model_fails_it_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        google_llm, "_post", lambda model, key, body: (_ for _ in ()).throw(_http_error(503))
    )
    with pytest.raises(google_llm.GoogleUnavailable) as caught:
        classify(["a", "b"])
    assert caught.value.code == "llm_failed"
    # The message names what was tried, so a run's recorded error is diagnosable.
    message = str(caught.value)
    assert "a" in message
    assert "b" in message


def test_an_unreachable_network_falls_through(monkeypatch: pytest.MonkeyPatch) -> None:
    def post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
        if model == "offline":
            raise urllib.error.URLError("no route")
        return _reply([LABEL])

    monkeypatch.setattr(google_llm, "_post", post)
    _, model = classify(["offline", "reachable"])
    assert model == "reachable"


def test_no_models_configured_is_reported_not_crashed() -> None:
    with pytest.raises(google_llm.GoogleUnavailable) as caught:
        classify([])
    assert caught.value.code == "llm_not_configured"


# --------------------------------------------------------------- narrowing ---


def test_labelling_only_ever_narrows() -> None:
    """The model may discard a quote. It may never add a claim, invent a topic
    outside the vocabulary, or relabel a passage it was not given."""
    chunk = ["a quote", "another"]
    rejected = [
        {**LABEL, "about_product": False},
        {**LABEL, "is_impression": False},
        {**LABEL, "topic": "invented-topic"},
        {**LABEL, "stance": "enthusiastic"},
        {**LABEL, "index": 99},
        {**LABEL, "index": -1},
        {**LABEL, "index": "nought"},
    ]
    for item in rejected:
        assert insights._keep(item, chunk=chunk, start=0, model="m") == []

    kept = insights._keep({**LABEL, "index": 1}, chunk=chunk, start=10, model="m")
    assert len(kept) == 1
    # The quote travels verbatim, and the model that judged it is recorded.
    assert kept[0].quote == "another"
    assert kept[0].source_index == 11
    assert kept[0].tagged_by == "llm/m"


# ---------------------------------------------------------------- provider ---


@pytest.mark.parametrize(
    ("choice", "google", "anthropic", "expected"),
    [
        ("auto", True, True, "google"),
        ("auto", False, True, "anthropic"),
        ("auto", False, False, "none"),
        ("google", True, True, "google"),
        ("google", False, True, "none"),
        ("anthropic", True, True, "anthropic"),
        ("anthropic", True, False, "none"),
        ("none", True, True, "none"),
    ],
)
def test_provider_selection(
    monkeypatch: pytest.MonkeyPatch, choice: str, google: bool, anthropic: bool, expected: str
) -> None:
    """A provider that is asked for but not configured resolves to "none"
    rather than silently falling back: an installation that set a provider on
    purpose should be told the key is missing, not quietly use the other one."""
    from pydantic import SecretStr

    class Fake:
        llm_provider = choice
        google_api_key = SecretStr("g") if google else None
        anthropic_api_key = SecretStr("a") if anthropic else None

    monkeypatch.setattr(insights, "get_settings", lambda: Fake())
    assert insights.provider() == expected
    assert insights.available() is (expected != "none")


def test_the_model_chain_is_deduplicated_and_ordered() -> None:
    class Fake:
        google_model = "primary"
        google_fallback_models = "second, primary ,, third"

    assert insights._models(Fake()) == ["primary", "second", "third"]
