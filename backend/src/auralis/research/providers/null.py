"""The provider that does nothing, and says so.

This is the default, and it is not a stub to be replaced later — it is the
correct behaviour for an installation that has not opted into scraping. It
raises rather than returning an empty list, because "no provider configured"
and "searched and found nothing" are different facts and the interface tells
them apart: the first explains itself, the second says the community has not
discussed this earphone.
"""

from __future__ import annotations

from auralis.research.provider import Discussion, ResearchUnavailable, SearchRequest, ThreadRequest

REASON = (
    "No Reddit provider is configured, so community research has not run. "
    "Measured recommendations are unaffected."
)


class NullProvider:
    name = "none"

    def search(self, request: SearchRequest) -> list[Discussion]:
        raise ResearchUnavailable(REASON, code="provider_disabled")

    def threads(self, request: ThreadRequest) -> list[Discussion]:
        raise ResearchUnavailable(REASON, code="provider_disabled")
