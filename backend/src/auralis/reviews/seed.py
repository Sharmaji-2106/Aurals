"""Load a curated gathering of review evidence from ``data/reviews/*.json``.

The files are the record: each one names the IEM, the date the gathering was made, and
for every source its publication, author, title, URL and the passages quoted from it.
Loading is idempotent — a source is keyed by its URL — so a file can be corrected and
re-loaded without duplicating anything.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from auralis.core.errors import NotFound
from auralis.iem.models import Iem
from auralis.reviews.models import TOPICS, ReviewClaim, ReviewSource

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "reviews"
STANCES = {"positive", "negative", "mixed"}
KINDS = {"publication", "forum", "reddit", "video"}


class InvalidCollection(ValueError):
    pass


def _check(payload: dict[str, Any]) -> None:
    for field in ("collection", "iem_slug", "retrieved_at", "sources"):
        if not payload.get(field):
            raise InvalidCollection(f"missing {field}")
    for source in payload["sources"]:
        for field in ("kind", "publication", "title", "url", "claims"):
            if not source.get(field):
                raise InvalidCollection(f"source missing {field}: {source.get('url', '?')}")
        if source["kind"] not in KINDS:
            raise InvalidCollection(f"unknown source kind: {source['kind']}")
        if not source["url"].startswith("https://"):
            raise InvalidCollection(f"source url must be https: {source['url']}")
        for claim in source["claims"]:
            if claim.get("topic") not in TOPICS:
                raise InvalidCollection(f"unknown topic: {claim.get('topic')}")
            if claim.get("stance") not in STANCES:
                raise InvalidCollection(f"unknown stance: {claim.get('stance')}")
            if not claim.get("quote", "").strip():
                raise InvalidCollection("a claim has no quote")


def load_file(db: Session, path: Path) -> tuple[str, int, int]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    _check(payload)
    slug = payload["iem_slug"]
    iem = db.scalar(select(Iem).where(Iem.slug == slug))
    if iem is None:
        raise NotFound(f"{slug} is not in the catalogue; import measurements first.")

    retrieved = datetime.fromisoformat(payload["retrieved_at"])
    tagged_on = retrieved.date()
    sources = claims = 0
    for entry in payload["sources"]:
        row = db.scalar(
            select(ReviewSource).where(
                ReviewSource.iem_id == iem.id, ReviewSource.url == entry["url"]
            )
        )
        if row is None:
            row = ReviewSource(iem_id=iem.id, url=entry["url"])
            db.add(row)
        row.collection = payload["collection"]
        row.kind = entry["kind"]
        row.publication = entry["publication"]
        row.author = entry.get("author")
        row.title = entry["title"]
        row.published_on = (
            date.fromisoformat(entry["published_on"]) if entry.get("published_on") else None
        )
        row.excerpt = entry.get("excerpt")
        row.retrieved_at = retrieved
        row.license_note = entry.get("license_note") or payload.get("license_note")
        db.flush()
        # The quotes are rewritten wholesale: the file is the record, not the table.
        db.execute(delete(ReviewClaim).where(ReviewClaim.source_id == row.id))
        for claim in entry["claims"]:
            db.add(
                ReviewClaim(
                    source_id=row.id,
                    topic=claim["topic"],
                    stance=claim["stance"],
                    quote=claim["quote"],
                    tagged_by=claim.get("tagged_by", "auralis-editorial"),
                    tagged_on=tagged_on,
                )
            )
            claims += 1
        sources += 1
    return slug, sources, claims


def load_all(db: Session, directory: Path | None = None) -> list[tuple[str, int, int]]:
    folder = directory or DATA_DIR
    if not folder.is_dir():
        raise NotFound(f"No review collections at {folder}")
    results = []
    for path in sorted(folder.glob("*.json")):
        results.append(load_file(db, path))
        log.info("loaded review collection %s", path.name)
    return results
