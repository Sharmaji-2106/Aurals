"""Loading product photography, with the provenance that makes it defensible.

The measurement source carries no imagery — AutoEq's index has five columns and
none of them is a picture — so there is nothing to import automatically and no
honest way to generate one. A photograph of an earphone has to come from
somewhere real, and whoever took it still owns it.

So images are gathered deliberately, a few at a time, and recorded the way
every other external asset in this schema is recorded: what it is, where it
came from, who to credit, and when it was fetched. ``data/iem-images/index.json``
is the record; the database is a copy of it. An earphone with no entry keeps a
null ``image_path`` and the interface says it has no photograph rather than
substituting something that looks like one.

Run with ``auralis import-iem-images``.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.core.errors import NotFound
from auralis.iem.models import Iem

#: Where the gathering lives. Images sit beside the index that describes them.
DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "iem-images"

#: Only formats a browser renders without help.
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".avif"}

REQUIRED = ("slug", "file", "source", "source_url", "credit", "retrieved_on")


class InvalidImageIndex(ValueError):
    """The index does not describe what it claims to."""


def _check(entry: dict[str, Any], index: int, root: Path) -> None:
    for field in REQUIRED:
        if not entry.get(field):
            raise InvalidImageIndex(f"entry {index}: {field} is required")

    suffix = Path(str(entry["file"])).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise InvalidImageIndex(f"entry {index}: {suffix or 'no suffix'} is not a web image format")

    # A path that escapes the gathering would let the index point anywhere on
    # disk; the file must be one of the ones sitting next to it.
    path = (root / str(entry["file"])).resolve()
    if root.resolve() not in path.parents:
        raise InvalidImageIndex(f"entry {index}: file must sit inside {root.name}")
    if not path.is_file():
        raise InvalidImageIndex(f"entry {index}: {entry['file']} is not on disk")

    url = str(entry["source_url"])
    if not url.startswith("https://"):
        raise InvalidImageIndex(f"entry {index}: source_url must be https")

    try:
        date.fromisoformat(str(entry["retrieved_on"]))
    except ValueError as exc:
        raise InvalidImageIndex(f"entry {index}: retrieved_on must be a date") from exc


def load_index(db: Session, directory: Path | None = None) -> tuple[int, list[str]]:
    """Point the catalogue at the gathered photographs.

    Returns the number of earphones updated and the slugs the index names that
    the catalogue does not have. An unknown slug is reported rather than
    raising: the index outlives any one import of the measurements.
    """
    root = directory or DATA_DIR
    index_file = root / "index.json"
    if not index_file.is_file():
        raise NotFound(f"No image index at {index_file}.")

    entries = json.loads(index_file.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise InvalidImageIndex("index.json must be a list of entries")

    updated = 0
    unknown: list[str] = []
    for i, entry in enumerate(entries):
        _check(entry, i, root)
        slug = str(entry["slug"])
        iem = db.scalar(select(Iem).where(Iem.slug == slug))
        if iem is None:
            unknown.append(slug)
            continue
        iem.image_path = str(entry["file"])
        iem.image_source = str(entry["source"])
        iem.image_source_url = str(entry["source_url"])
        iem.image_credit = str(entry["credit"])
        iem.image_retrieved_on = date.fromisoformat(str(entry["retrieved_on"]))
        updated += 1
    return updated, unknown
