"""Evaluation inputs, loaded from the database without exposing anyone's identity.

Track analyses describe public recordings and contain no personal data. Real listener
libraries are included only as anonymous aggregates ("Library A, 106 songs"), and only
their derived numbers are reported.
"""

from __future__ import annotations

import csv
import string
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from auralis.analysis.curation import CurationTrack
from auralis.analysis.features import TrackFeatures
from auralis.analysis.version import ANALYZER_VERSION
from auralis.music.models import MusicProfile, Track, TrackAnalysis
from auralis.music.pipeline import load_library
from auralis.questionnaire.models import QuestionnaireResponse

CORPUS_FILE = Path(__file__).resolve().parents[3] / "calibration" / "corpus-2026-09.tsv"


@dataclass(frozen=True, slots=True)
class Library:
    label: str
    tracks: list[CurationTrack]
    answers: dict[str, str | None] | None


@dataclass(frozen=True, slots=True)
class PoolTrack:
    source_id: str
    track: CurationTrack


def track_pool(db: Session) -> list[PoolTrack]:
    """Every successfully analysed recording (public audio, no listener data)."""
    rows = db.execute(
        select(Track.id, Track.source_id, Track.duration_s, TrackAnalysis.features)
        .join(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        .where(
            TrackAnalysis.analyzer_version == ANALYZER_VERSION,
            TrackAnalysis.status == "succeeded",
        )
        .order_by(Track.source_id)
    ).all()
    return [
        PoolTrack(
            source_id,
            CurationTrack(str(track_id), TrackFeatures.model_validate(features), duration),
        )
        for track_id, source_id, duration, features in rows
        if features is not None
    ]


def corpus_genres(path: Path = CORPUS_FILE) -> dict[str, str]:
    with path.open(encoding="utf-8") as handle:
        rows = csv.reader((line for line in handle if not line.startswith("#")), delimiter="\t")
        return {row[0]: row[1] for row in rows if len(row) >= 2}


def listener_libraries(db: Session, min_songs: int = 5) -> list[Library]:
    """Real libraries, anonymised and ordered by size (largest first)."""
    users = db.scalars(select(MusicProfile.user_id).distinct()).all()
    libraries = []
    for user_id in users:
        tracks = load_library(db, user_id)
        if len(tracks) < min_songs:
            continue
        response = db.scalar(
            select(QuestionnaireResponse)
            .where(QuestionnaireResponse.user_id == user_id)
            .order_by(QuestionnaireResponse.created_at.desc())
            .limit(1)
        )
        libraries.append((tracks, response.answers if response else None))
    libraries.sort(key=lambda item: len(item[0]), reverse=True)
    return [
        Library(f"Library {string.ascii_uppercase[i]}", tracks, answers)
        for i, (tracks, answers) in enumerate(libraries)
    ]
