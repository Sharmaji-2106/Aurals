"""Idempotently import verified product photographs and their source originals."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.iem.images import DATA_DIR
from auralis.iem.models import Iem, IemImage


@dataclass
class LibraryReport:
    added: int = 0
    duplicate: int = 0
    primary: int = 0
    unknown: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def import_library(session: Session, path: Path, *, dry_run: bool = False) -> LibraryReport:
    report = LibraryReport()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row: dict[str, Any] = json.loads(line)
            required = (
                "slug",
                "file_path",
                "role",
                "width",
                "height",
                "format",
                "byte_size",
                "sha256",
                "source_name",
                "page_url",
                "image_url",
                "credit",
                "retrieved_on",
                "licence_note",
                "verification_status",
            )
            if any(row.get(key) in (None, "") for key in required):
                raise ValueError("missing required image metadata or provenance")
            if row["role"] not in ("primary", "alternate", "original"):
                raise ValueError("invalid role")
            if row["verification_status"] not in ("verified", "unverified"):
                raise ValueError("invalid verification status")
            if row["role"] == "primary" and row["verification_status"] != "verified":
                raise ValueError("primary image must be visually verified")
            if not all(str(row[key]).startswith("https://") for key in ("page_url", "image_url")):
                raise ValueError("source URLs must be HTTPS")
            file_path = (DATA_DIR / row["file_path"]).resolve()
            if DATA_DIR.resolve() not in file_path.parents or not file_path.is_file():
                raise ValueError("file missing or outside approved library")
            content = file_path.read_bytes()
            if (
                len(content) != int(row["byte_size"])
                or hashlib.sha256(content).hexdigest() != row["sha256"]
            ):
                raise ValueError("image bytes differ from manifest")
            iem = session.scalar(select(Iem).where(Iem.slug == row["slug"]))
            if iem is None:
                report.unknown.append(row["slug"])
                continue
            previous = session.scalar(
                select(IemImage).where(
                    IemImage.iem_id == iem.id, IemImage.file_path == row["file_path"]
                )
            )
            if previous is not None:
                report.duplicate += 1
                continue
            if dry_run:
                report.added += 1
                continue
            derived_id = None
            if row.get("derived_from"):
                source = session.scalar(
                    select(IemImage).where(
                        IemImage.iem_id == iem.id, IemImage.file_path == row["derived_from"]
                    )
                )
                if source is None:
                    raise ValueError("source original must be imported before derivative")
                derived_id = source.id
            if row["role"] == "primary":
                current = session.scalar(
                    select(IemImage).where(IemImage.iem_id == iem.id, IemImage.role == "primary")
                )
                if current is not None:
                    current.role = "original" if current.derived_from_id is None else "alternate"
                    session.flush()
            session.add(
                IemImage(
                    iem_id=iem.id,
                    file_path=row["file_path"],
                    role=row["role"],
                    derived_from_id=derived_id,
                    width=int(row["width"]),
                    height=int(row["height"]),
                    format=row["format"],
                    byte_size=int(row["byte_size"]),
                    sha256=row["sha256"],
                    perceptual_hash=row.get("perceptual_hash"),
                    source_name=row["source_name"],
                    page_url=row["page_url"],
                    image_url=row["image_url"],
                    credit=row["credit"],
                    retrieved_on=date.fromisoformat(row["retrieved_on"]),
                    licence_note=row["licence_note"],
                    verification_status=row["verification_status"],
                    verification_method=row.get("verification_method"),
                    verification_note=row.get("verification_note"),
                    quality_score=row.get("quality_score"),
                    processing_notes=row.get("processing_notes"),
                )
            )
            if row["role"] == "primary":
                iem.image_path = row["file_path"]
                iem.image_source = row["source_name"]
                iem.image_source_url = row["page_url"]
                iem.image_credit = row["credit"]
                iem.image_retrieved_on = date.fromisoformat(row["retrieved_on"])
                report.primary += 1
            session.flush()
            report.added += 1
        except (ValueError, KeyError, TypeError) as exc:
            report.errors.append(f"line {line_no}: {exc}")
    return report
