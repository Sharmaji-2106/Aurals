"""Classifying quotes with Google's Generative Language API.

A sibling of the Anthropic path in ``insights``, held to exactly the same rules:
the model receives text and returns labels, it never writes anything that
reaches the screen, it may only narrow, and whichever model actually answered is
recorded so a reader can tell what judged what.

Two things here are not incidental.

**The request is plain HTTP.** The backend already depends on ``anthropic``;
adding a second vendor SDK to send one JSON body for a fixed schema would be a
dependency to keep current for no benefit. ``urllib`` is in the standard
library, the call is a single POST, and it is trivial to stub in a test.

**There is a chain of models, not a model.** This was not foresight; it was
measured. Asking six models the same question on this key: ``gemini-3.6-flash``,
``gemini-3.7-flash`` and ``gemini-flash-latest`` all answered 503 "currently
experiencing high demand", ``gemini-2.5-flash`` answered 404 "no longer
available to new users", and both lite models answered correctly in 180 tokens.
A client with one model name in it would have lost that run's labelling
entirely, and would break outright the next time a model is retired.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Final

log = logging.getLogger(__name__)

ENDPOINT: Final = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_S: Final = 60

#: Statuses worth trying the next model for. A 400 means the request itself is
#: wrong and the next model will reject it the same way, so it is not retried.
RETRYABLE: Final = frozenset({404, 429, 500, 502, 503, 504})


class GoogleUnavailable(Exception):
    """No model answered. The caller records why and carries on unlabelled."""

    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


def _schema(topics: list[str], stances: list[str]) -> dict[str, Any]:
    """The reply's shape, enforced by the API rather than hoped for.

    ``responseSchema`` with an enum on the two label fields means a malformed
    topic cannot come back at all, which removes the whole class of "the model
    invented a category" failure that a free-text reply would need guarding
    against.
    """
    return {
        "type": "OBJECT",
        "properties": {
            "labels": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "index": {"type": "INTEGER"},
                        "about_product": {"type": "BOOLEAN"},
                        "is_impression": {"type": "BOOLEAN"},
                        "topic": {"type": "STRING", "enum": topics},
                        "stance": {"type": "STRING", "enum": stances},
                    },
                    "required": [
                        "index",
                        "about_product",
                        "is_impression",
                        "topic",
                        "stance",
                    ],
                },
            }
        },
        "required": ["labels"],
    }


def _post(model: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(  # noqa: S310 - https only, built from a constant
        f"{ENDPOINT.format(model=model)}?key={key}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:  # noqa: S310
        payload: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    return payload


def classify(
    *,
    system: str,
    user: str,
    topics: list[str],
    stances: list[str],
    api_key: str,
    models: list[str],
    max_tokens: int,
) -> tuple[list[dict[str, Any]], str]:
    """Label one batch, returning the labels and the model that produced them.

    Tries each model in turn. A model that is busy, missing or broken costs one
    attempt; the first that answers wins. Raises only when every one has failed,
    because a run that stores its sources unlabelled is a worse outcome than a
    slow one but a far better outcome than a run that invents labels.
    """
    if not models:
        raise GoogleUnavailable("No model is configured.", code="llm_not_configured")

    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            # Classification against a fixed vocabulary: there is nothing here
            # that sampling improves and a great deal it could make
            # inconsistent between two runs over the same quotes.
            "temperature": 0,
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
            "responseSchema": _schema(topics, stances),
        },
    }

    problems: list[str] = []
    for model in models:
        try:
            payload = _post(model, api_key, body)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:200]
            problems.append(f"{model}: HTTP {exc.code}")
            if exc.code in RETRYABLE:
                log.warning("google model %s unavailable (%s), trying the next", model, exc.code)
                continue
            # A 400 is our request, not their capacity. The next model will
            # reject it identically, so stop rather than hammer the list.
            raise GoogleUnavailable(
                f"Google rejected the request: {detail}", code="llm_failed"
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            problems.append(f"{model}: {type(exc).__name__}")
            log.warning("google model %s unreachable (%s), trying the next", model, exc)
            continue

        if "error" in payload:
            problems.append(f"{model}: {payload['error'].get('status', 'error')}")
            continue

        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            labels = json.loads(text)["labels"]
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            # A reply that does not parse is a reply we cannot trust; the next
            # model gets a turn rather than this one getting the benefit of the
            # doubt.
            problems.append(f"{model}: unreadable reply")
            log.warning("google model %s returned an unreadable reply: %s", model, exc)
            continue

        if not isinstance(labels, list):
            problems.append(f"{model}: labels were not a list")
            continue
        return labels, model

    raise GoogleUnavailable(
        "No Google model could label this batch (" + "; ".join(problems) + ").",
        code="llm_failed",
    )
