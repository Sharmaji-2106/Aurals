"""Import published measurement datasets and targets, with full provenance.

Source: the AutoEq project (Pasanen; code under the MIT licence), pinned to one commit
so every import is reproducible. AutoEq redistributes measurements made by others; the
measurement data remains the work of its authors and is used here for non-commercial
research with attribution. Nothing is committed to this repository: files are fetched
into a local cache (``.devtools/data``) and stored in the database with the exact
commit and path they came from.

Only one measurer is imported for IEMs: oratory1990, whose in-ear measurements use
G.R.A.S. ear simulators compliant with IEC 60318-4, the fixture family the Harman
in-ear target was defined on. Measurements from other rigs are not mixed in, because a
target is only meaningful on the kind of fixture it was defined on.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.acoustics import fr
from auralis.core.errors import Conflict
from auralis.iem.importer import checksum, import_points, parse_points
from auralis.iem.models import FrTarget

log = logging.getLogger(__name__)

AUTOEQ_REPO: Final = "jaakkopasanen/AutoEq"
AUTOEQ_COMMIT: Final = "7ae0f56d53074872b028649617a22bbb4232feb7"  # master, 2025-07-20
# Local, git-ignored download cache; override with AURALIS_DATA_DIR.
CACHE_DIR: Final = (
    Path(
        os.environ.get("AURALIS_DATA_DIR")
        or Path(__file__).resolve().parents[4] / ".devtools" / "data"
    )
    / "autoeq"
)

# Fixtures whose in-ear measurements are IEC 60318-4 ear-simulator measurements.
RIG_FAMILIES: Final[dict[str, str]] = {
    "GRAS 43AC": "iec60318-4",
    "GRAS 43ACB": "iec60318-4",
    "GRAS 45BC": "iec60318-4",
    "GRAS 45BC-10": "iec60318-4",
}

MULTI_WORD_BRANDS: Final = (
    "64 Audio",
    "Bowers & Wilkins",
    "Bang & Olufsen",
    "Cambridge Audio",
    "Campfire Audio",
    "Cosmic Ears",
    "DITA Audio",
    "Final Audio",
    "Hi-Fri Audio",
    "JH Audio",
    "JLab Audio",
    "Kiwi Ears",
    "Light Harmonic",
    "MEE Audio",
    "MiM Audio",
    "NF Audio",
    "NS Audio",
    "Noble Audio",
    "Periodic Audio",
    "Pai Audio",
    "PMG Audio",
    "Prisma Audio",
    "Spiral Ear",
    "Shozy & Neo",
    "Status Audio",
    "Tin HiFi",
    "Ultimate Ears",
    "Vision Ears",
)

ORATORY1990_LICENSE: Final = (
    "Measurement by oratory1990, redistributed in AutoEq (MIT-licensed project). "
    "Used for non-commercial research with attribution; confirm permission before any "
    "other use."
)


@dataclass(frozen=True, slots=True)
class TargetSpec:
    name: str
    label: str
    path: str
    description: str


HARMAN_CITATION: Final = (
    "Olive, Welti & Khonsaripour, Harman in-ear target (2019 revision), following "
    "'A Statistical Model that Predicts Listeners' Preference Ratings of In-Ear "
    "Headphones', AES 143rd Convention (2017). Numeric curve as distributed by AutoEq."
)

TARGETS: Final[tuple[TargetSpec, ...]] = (
    TargetSpec(
        "harman-ie-2019",
        "Harman in-ear 2019",
        "targets/Harman in-ear 2019.csv",
        "The in-ear response most listeners preferred in Harman's controlled tests, "
        "including its bass shelf (about +9 dB below ~100 Hz). Defined on an IEC 60318-4 "
        "coupler.",
    ),
    TargetSpec(
        "harman-ie-2019-no-bass",
        "Harman in-ear 2019 without bass shelf",
        "targets/Harman in-ear 2019 without bass.csv",
        "The same target with its bass shelf removed; the shelf is a separate, adjustable "
        "component in Harman's personalisation research.",
    ),
)


def raw_url(path: str, commit: str = AUTOEQ_COMMIT) -> str:
    return f"https://raw.githubusercontent.com/{AUTOEQ_REPO}/{commit}/{urllib.parse.quote(path)}"


def fetch(path: str, commit: str = AUTOEQ_COMMIT, cache: Path = CACHE_DIR) -> str:
    """Text of one file at the pinned commit, cached locally after the first download.

    A short per-address connect timeout with retries: the CDN serves several addresses
    and an unreachable one would otherwise stall each request for the OS TCP timeout.
    """
    local = cache / commit / path
    if not local.exists():
        local.parent.mkdir(parents=True, exist_ok=True)
        error: OSError | None = None
        for _ in range(3):
            try:
                with urllib.request.urlopen(raw_url(path, commit), timeout=6) as response:  # noqa: S310
                    local.write_bytes(response.read())
                break
            except OSError as exc:
                error = exc
        else:
            raise error or OSError(f"could not download {path}")
    return local.read_text(encoding="utf-8-sig")


def prefetch(paths: list[str], commit: str = AUTOEQ_COMMIT, workers: int = 12) -> list[str]:
    """Download many files in parallel; returns the paths that failed."""
    failed = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch, path, commit): path for path in paths}
        for future in as_completed(futures):
            if future.exception() is not None:
                failed.append(futures[future])
    return failed


def split_name(name: str) -> tuple[str, str, str | None]:
    """Brand, model and measured configuration from a display name.

    "Tin HiFi T2 (foam eartips)" -> ("Tin HiFi", "T2", "foam eartips"): a configuration
    is a condition of the measurement, not a different product.
    """
    variant = None
    match = re.match(r"^(.*?)\s*\((.+)\)$", name)
    if match:
        name, variant = match.group(1), match.group(2)
    for brand in MULTI_WORD_BRANDS:
        if name.startswith(brand + " "):
            return brand, name[len(brand) + 1 :], variant
    brand, _, model = name.partition(" ")
    return brand, model or name, variant


def import_targets(session: Session, commit: str = AUTOEQ_COMMIT) -> int:
    added = 0
    for spec in TARGETS:
        if session.scalar(select(FrTarget.id).where(FrTarget.name == spec.name)):
            continue
        points = parse_points(fetch(spec.path, commit))
        fr.validate_points(points)
        session.add(
            FrTarget(
                name=spec.name,
                label=spec.label,
                rig_family="iec60318-4",
                description=spec.description,
                citation=HARMAN_CITATION,
                source="AutoEq",
                source_url=raw_url(spec.path, commit),
                source_ref=f"AutoEq@{commit}:{spec.path}",
                license="Target published by Harman; numeric file from AutoEq (MIT).",
                raw_points=points,
                checksum=checksum(points),
            )
        )
        added += 1
    session.flush()
    return added


@dataclass(frozen=True, slots=True)
class ImportReport:
    imported: int
    skipped_duplicate: int
    skipped_rig: int
    failed: list[str]


def import_oratory1990_inear(
    session: Session, commit: str = AUTOEQ_COMMIT, limit: int | None = None
) -> ImportReport:
    base = "measurements/oratory1990"
    index = list(
        csv.DictReader(io.StringIO(fetch(f"{base}/name_index.tsv", commit)), delimiter="\t")
    )
    prefetch(
        sorted(
            {
                f"{base}/data/in-ear/{(r.get('name') or r.get('source_name') or '').strip()}.csv"
                for r in index
                if r.get("form", "").strip() == "in-ear"
            }
        ),
        commit,
    )
    seen: set[str] = set()
    imported = duplicates = wrong_rig = 0
    failed: list[str] = []
    for row in index:
        name = (row.get("name") or row.get("source_name") or "").strip()
        rig = re.sub(r"^GRAS GRAS", "GRAS", (row.get("rig") or "").strip())
        if row.get("form", "").strip() != "in-ear" or not name or name in seen:
            continue
        seen.add(name)
        family = RIG_FAMILIES.get(rig)
        if family is None:
            wrong_rig += 1
            continue
        path = f"{base}/data/in-ear/{name}.csv"
        try:
            points = parse_points(fetch(path, commit))
            brand, model, variant = split_name(name)
            with session.begin_nested():
                import_points(
                    session,
                    points,
                    brand=brand,
                    model=model,
                    source="oratory1990 (via AutoEq)",
                    source_url=(row.get("url") or "").strip() or None,
                    rig=rig,
                    rig_family=family,
                    form="in-ear",
                    variant=variant,
                    source_ref=f"AutoEq@{commit}:{path}",
                    retrieved_at=datetime.now(UTC),
                    license=ORATORY1990_LICENSE,
                    notes=(f"Configuration: {variant}. " if variant else "")
                    + "Numeric data extracted by AutoEq from oratory1990's published PDF.",
                )
            imported += 1
        except Conflict:
            duplicates += 1
        except (OSError, ValueError) as exc:  # network, parse or validation problems
            failed.append(f"{name}: {exc}")
            log.warning("skipped %s: %s", name, exc)
        if limit is not None and imported >= limit:
            break
    return ImportReport(imported, duplicates, wrong_rig, failed)
