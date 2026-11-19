"""Reddit retrieval via the third-party ``reddrix`` package.

WHAT THIS IS, STATED PLAINLY
----------------------------
Reddrix is a scraper, not a client for Reddit's Data API. Its own
documentation says it scrapes New Reddit's HTML and internal endpoints
"protected by Cloudflare and reCaptcha Enterprise", that Reddit's JSON
endpoints are "now behind login walls", and that its stealth mode's "random
mouse movements constantly generate reCaptcha Enterprise clearances". It
offers rotating proxies for when requests are blocked. It makes no statement
about Reddit's Terms of Service, the Data API Terms, robots.txt or rate limits.

Using it therefore means retrieving content through defences that Reddit put
in place to prevent exactly this. That was raised with the project's owner,
with those quotations, alongside the alternative of building against the
official Data API. The owner reviewed it and chose to proceed with Reddrix.
This module exists because of that decision, and records it so that nobody
later mistakes it for an oversight.

Three consequences are built in rather than left to discipline:

* It is **off by default**. ``AURALIS_REDDIT_PROVIDER`` defaults to ``none``,
  so a fresh checkout performs no scraping until someone opts in explicitly.
* Stealth and proxies are **off by default** too, and configured separately.
  The library's README and its argument table disagree about the default for
  ``stealth``, so it is always passed explicitly here.
* Nothing retrieved is presented as more than it is. Quotes stay verbatim with
  the author and a permalink, and none of it moves an earphone up or down the
  ranking.

HOW IT IS USED
--------------
Two phases, because the library provides no single call that does both:
``keyword_search`` returns posts and never their replies, so comment threads
require a second pass in ``standard`` mode over the post URLs. Measured:
~23 s per search, ~27 s for a batched thread fetch of one post. ``post_urls``
accepts many posts per call, so the job batches.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from auralis.research.provider import (
    Discussion,
    ResearchUnavailable,
    SearchRequest,
    ThreadRequest,
)

log = logging.getLogger(__name__)

#: Wall-clock ceilings. A search that has not answered in this long is not
#: going to, and the listener is waiting on it.
SEARCH_TIMEOUT_SECONDS = 90.0
THREAD_TIMEOUT_SECONDS = 240.0

#: Hard ceiling on items pulled from one call, so a pathological thread cannot
#: stream indefinitely into memory.
MAX_ITEMS_PER_CALL = 600


class ReddrixProvider:
    """Retrieval through ``reddrix``. Fetches only; never judges or stores."""

    name = "reddrix"

    def __init__(
        self,
        *,
        stealth: str = "off",
        proxies: tuple[str, ...] = (),
    ) -> None:
        # Mapped rather than passed through: the library takes True/False or
        # the string "adaptive", and the config surface should not leak that.
        modes: dict[str, bool | str] = {"off": False, "on": True, "adaptive": "adaptive"}
        self._stealth: bool | str = modes.get(stealth, False)
        self._proxies = list(proxies)

    # ------------------------------------------------------------- public ---

    def search(self, request: SearchRequest) -> list[Discussion]:
        items = self._collect(
            label=f"search {request.slug}",
            timeout=SEARCH_TIMEOUT_SECONDS,
            limit=request.max_results,
            options={
                "mode": "keyword_search",
                "query": request.query,
                "max_results": request.max_results,
                "include_comments": False,
            },
        )
        return [d for d in (self._to_discussion(raw) for raw in items) if d is not None]

    def threads(self, request: ThreadRequest) -> list[Discussion]:
        if not request.urls:
            return []
        items = self._collect(
            label=f"threads x{len(request.urls)}",
            timeout=THREAD_TIMEOUT_SECONDS,
            limit=MAX_ITEMS_PER_CALL,
            options={
                "mode": "standard",
                "post_urls": list(request.urls),
                "include_comments": True,
                "max_comments_per_post": request.max_comments_per_post,
                "max_top_comments_per_post": request.max_comments_per_post,
                "max_comments_depth": request.max_depth,
            },
        )
        return [d for d in (self._to_discussion(raw) for raw in items) if d is not None]

    # ------------------------------------------------------------ internal ---

    def _collect(
        self, *, label: str, timeout: float, limit: int, options: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Run one Reddrix session and return its raw items.

        The worker is synchronous — handlers are plain callables in spawned
        processes — and Reddrix is async-only, so each call owns a short-lived
        event loop. That is deliberate: no loop outlives a single retrieval, so
        a wedged session cannot leak into the next one.
        """
        try:
            return asyncio.run(
                self._run(label=label, timeout=timeout, limit=limit, options=options)
            )
        except ResearchUnavailable:
            raise
        except Exception as exc:
            raise self._classify(exc) from exc

    async def _run(
        self, *, label: str, timeout: float, limit: int, options: dict[str, Any]
    ) -> list[dict[str, Any]]:
        try:
            from reddrix import Reddrix
        except ImportError as exc:  # pragma: no cover - depends on the install
            raise ResearchUnavailable(
                "The Reddit provider is selected but the reddrix package is not installed.",
                code="provider_missing",
            ) from exc

        async def pump() -> list[dict[str, Any]]:
            out: list[dict[str, Any]] = []
            async with Reddrix(
                stealth=self._stealth,
                proxies=self._proxies,
                verbose=False,
                **options,
            ) as rx:
                async for raw in rx.get_items():
                    out.append(raw)
                    if len(out) >= min(limit, MAX_ITEMS_PER_CALL):
                        break
            return out

        try:
            items = await asyncio.wait_for(pump(), timeout=timeout)
        except TimeoutError as exc:
            raise ResearchUnavailable(
                f"Reddit retrieval timed out after {timeout:.0f}s.",
                code="provider_timeout",
                retryable=True,
            ) from exc
        log.info("reddrix %s returned %d items", label, len(items))
        return items

    @staticmethod
    def _classify(exc: Exception) -> ResearchUnavailable:
        """Turn a library error into something the run can record and show."""
        name = type(exc).__name__
        if name == "FatalAntiBotBlockError":
            return ResearchUnavailable(
                "Reddit blocked the request and did not relent on retry.",
                code="provider_blocked",
                retryable=True,
            )
        if name == "AntiBotBlockError":
            return ResearchUnavailable(
                "Reddit blocked the request.", code="provider_blocked", retryable=True
            )
        if name == "NotInitializedError":
            return ResearchUnavailable(
                "The Reddit provider was used before it was started.",
                code="provider_error",
            )
        return ResearchUnavailable(
            f"Reddit retrieval failed: {name}", code="provider_error", retryable=True
        )

    # -------------------------------------------------------------- mapping ---

    @staticmethod
    def _to_discussion(raw: dict[str, Any]) -> Discussion | None:
        """Map one raw item, or ``None`` when it is unusable.

        Written defensively on purpose. This payload comes from scraped markup
        that changes without notice, so every field is treated as optional and
        a shape change drops the item rather than failing the run.
        """
        external_id = str(raw.get("submissionId") or "").strip()
        url = str(raw.get("submissionUrl") or "").strip()
        if not external_id or not url.startswith("https://"):
            return None

        kind = "comment" if raw.get("submissionType") == "comment" else "post"
        body = " ".join(str(raw.get("bodyText") or "").split())
        title = str(raw.get("title") or "").strip() or None
        if not body and not title:
            return None

        author = str(raw.get("author") or "").strip() or None
        if author in {"[deleted]", "[removed]", "AutoModerator"}:
            author = None

        return Discussion(
            external_id=external_id,
            kind=kind,
            url=url,
            # Reddrix reports the subreddit with its "r/" prefix.
            subreddit=str(raw.get("subreddit") or "").strip().removeprefix("r/"),
            author=author,
            title=title,
            body=body,
            created_at=_parse_when(raw.get("submittedAt")),
            score=_parse_int(raw.get("score")),
            num_comments=_parse_int(raw.get("numComments")),
            parent_post_url=str(raw.get("parentPostUrl") or "").strip() or None,
            parent_post_title=None,
        )


def _parse_when(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _parse_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
