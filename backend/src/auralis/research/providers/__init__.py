"""Reddit retrieval backends. One is chosen by configuration at run time."""

from __future__ import annotations

from auralis.config import get_settings
from auralis.research.provider import RedditProvider
from auralis.research.providers.null import NullProvider


def get_provider() -> RedditProvider:
    """The configured provider, defaulting to the one that does nothing.

    Imported lazily so that selecting ``none`` — the default — never pulls a
    scraping library, its browser automation stack or its transitive
    dependencies into the API process.
    """
    settings = get_settings()
    if settings.reddit_provider == "reddrix":
        from auralis.research.providers.reddrix_provider import ReddrixProvider

        return ReddrixProvider(
            stealth=settings.reddit_stealth,
            proxies=settings.reddit_proxy_list,
        )
    return NullProvider()
