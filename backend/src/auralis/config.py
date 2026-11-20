"""Application settings, loaded from environment variables (prefix ``AURALIS_``)."""

from __future__ import annotations

import shutil
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AURALIS_", env_file=(".env", "../.env"), extra="ignore"
    )

    env: Literal["development", "test", "production"] = "development"
    database_url: SecretStr = Field(
        default=SecretStr("postgresql+psycopg://auralis:auralis@localhost:5432/auralis"),
        validation_alias=AliasChoices("AURALIS_DATABASE_URL", "DATABASE_URL"),
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: object) -> object:
        if isinstance(v, SecretStr):
            v = v.get_secret_value()
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = "postgresql+psycopg://" + v[len("postgres://") :]
            elif v.startswith("postgresql://"):
                v = "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    # Review evidence. "curated" reads only the gathering loaded by
    # `auralis seed-reviews`; "curated+reddit" also serves what community
    # research has stored. Both read the same tables — the switch decides
    # whether scraped sources are shown, not where they live.
    review_source: Literal["curated", "curated+reddit"] = "curated"
    showcase_iem_slug: str = "moondrop-aria"

    # Community research. Off by default: "reddrix" retrieves Reddit content
    # through the site's anti-bot defences, which is the project owner's
    # explicit decision and not something a fresh checkout should start doing
    # on its own. See research/providers/reddrix_provider.py for the full
    # position. Stealth and proxies are separate switches and also default off.
    reddit_provider: Literal["none", "reddrix"] = "none"
    reddit_stealth: Literal["off", "on", "adaptive"] = "off"
    reddit_proxies: str = ""
    #: How many of the ranked earphones get researched. Each costs roughly
    #: 23 s of searching, measured, so this is a real budget on how long the
    #: listener waits rather than a soft preference.
    research_max_products: int = 3
    research_queries_per_product: int = 2
    research_max_posts_per_query: int = 6
    research_max_comments_per_post: int = 8

    # Topic and stance labelling for retrieved quotes. Without a key the run
    # still stores sources; it just cannot group them, and says so.
    anthropic_api_key: SecretStr | None = None
    llm_model: str = "claude-opus-5-5"

    google_api_key: SecretStr | None = None
    #: Primary model for Google. A small, fast one: the job is classifying
    #: short passages against a fixed vocabulary, which does not reward
    #: reasoning effort and does reward being cheap enough to run on every
    #: quote of every product.
    google_model: str = "gemini-3.5-flash-lite"
    #: Tried in order when the primary fails, comma separated.
    #:
    #: Not belt and braces. A free tier answers 503 "experiencing high demand"
    #: often enough that a single-model client would simply lose a run's
    #: labelling several times a day, and the observed failures are per-model:
    #: while the full flash models were refusing, both lite models answered
    #: immediately. Models are also retired without warning — `gemini-2.5-flash`
    #: already returns "no longer available to new users" — so a chain is also
    #: how this survives the catalogue moving under it.
    google_fallback_models: str = "gemini-3.1-flash-lite,gemini-3-flash-preview"

    #: Which provider labels community quotes. "auto" prefers Google when its
    #: key is present, because that is the one this install has.
    llm_provider: Literal["auto", "google", "anthropic", "none"] = "auto"

    @property
    def serves_reddit(self) -> bool:
        """Whether scraped community sources are published to the client.

        Separate from ``reddit_provider``: an installation can gather evidence
        and still choose not to show it.
        """
        return self.review_source == "curated+reddit"

    @property
    def reddit_proxy_list(self) -> tuple[str, ...]:
        return tuple(p.strip() for p in self.reddit_proxies.split(",") if p.strip())

    @property
    def reddit_enabled(self) -> bool:
        return self.reddit_provider != "none"

    # Sessions
    session_cookie_name: str = "auralis_session"
    session_ttl_days: int = 90

    # Music ingestion limits. These protect the worker and YouTube from abuse and keep
    # profiles representative rather than exhaustive.
    max_urls_per_submission: int = 20
    max_tracks_per_submission: int = 120
    max_active_submissions_per_user: int = 2
    min_track_seconds: int = 30
    max_track_seconds: int = 20 * 60
    max_download_bytes: int = 60_000_000

    # Worker
    work_dir: Path = Field(default_factory=lambda: Path(tempfile.gettempdir()) / "auralis")
    # The tuning duel's short-lived listening clips (one per listener, 24 h).
    tuning_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / ".cache" / "tuning"
    )
    worker_concurrency: int = 3
    worker_poll_seconds: float = 1.0
    job_stale_after_seconds: int = 600

    # yt-dlp needs a JavaScript runtime for YouTube. Deno is yt-dlp's default; we fall back
    # to Node when Deno isn't installed.
    ytdlp_js_runtime: str | None = None

    def resolved_js_runtime(self) -> str | None:
        if self.ytdlp_js_runtime:
            return self.ytdlp_js_runtime
        for runtime in ("deno", "node", "bun"):
            if shutil.which(runtime):
                return runtime
        return None

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
