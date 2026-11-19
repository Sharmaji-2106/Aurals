"""What a Reddit source has to be able to do, and nothing about how.

Community research is behind an interface for two reasons. The honest one is
that no provider is guaranteed to keep working: Reddit's access terms and
defences change, and a provider that stops returning results must be
replaceable without touching the job, the schema or the interface above it.
The practical one is that the default provider returns nothing at all, so the
whole feature can ship switched off.

A provider's only job is retrieval. It does not decide relevance, it does not
label anything, and it never writes to the database. Those happen in
``relevance`` and ``insights``, which are provider-agnostic and testable
without a network.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable


class ResearchUnavailable(Exception):
    """No community research can be performed right now.

    Carries a stable ``code`` so the run can record *why* and the interface can
    say so plainly, rather than showing an empty section and letting the
    listener assume nobody has an opinion.
    """

    def __init__(self, message: str, *, code: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class Discussion:
    """One retrieved post or comment, exactly as the provider found it.

    Nothing here is derived or inferred. ``body`` is whatever text the author
    wrote; it is quoted, never paraphrased, and ``url`` always points back to
    the original so a reader can check it.
    """

    external_id: str
    kind: str  # "post" | "comment"
    url: str
    subreddit: str
    author: str | None
    title: str | None
    body: str
    created_at: datetime | None
    score: int | None
    num_comments: int | None
    parent_post_url: str | None = None
    parent_post_title: str | None = None

    @property
    def is_comment(self) -> bool:
        return self.kind == "comment"


@dataclass(frozen=True, slots=True)
class SearchRequest:
    """One search to run. ``query`` is already quoted and product-specific."""

    slug: str
    query: str
    max_results: int


@dataclass(frozen=True, slots=True)
class ThreadRequest:
    """Open specific posts and read their comment threads.

    Retrieval is two-phase because searching and reading are separate
    operations: a search returns posts and never their replies, so the owner
    impressions the brief actually wants live behind a second fetch of the post
    URLs. Measured against the live provider, a search costs ~23 s and a
    batched thread fetch ~27 s, and ``urls`` takes many posts at once — so one
    batch for the whole run is far cheaper than one per product.
    """

    urls: tuple[str, ...]
    max_comments_per_post: int
    max_depth: int


@runtime_checkable
class RedditProvider(Protocol):
    """A source of Reddit discussions."""

    name: str
    """Stored on every run, so a result can always be traced to what fetched it."""

    def search(self, request: SearchRequest) -> list[Discussion]:
        """Return the posts matching one query. Comments are not included.

        Raises ``ResearchUnavailable`` when retrieval is impossible. Returning
        an empty list means the search genuinely found nothing, which is a
        result and must not be reported as a failure.
        """
        ...

    def threads(self, request: ThreadRequest) -> list[Discussion]:
        """Return the given posts together with their comments.

        Same contract as ``search``: empty is a result, exceptions are failures.
        """
        ...
