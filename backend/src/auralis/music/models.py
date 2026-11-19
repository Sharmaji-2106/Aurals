from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from auralis.db import Base, Timestamped, UUIDPk


class Track(UUIDPk, Timestamped, Base):
    """A recording on an external platform. Shared across users; holds no personal data."""

    __tablename__ = "tracks"
    __table_args__ = (UniqueConstraint("source", "source_id"),)

    source: Mapped[str] = mapped_column(String(16))
    source_id: Mapped[str] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(String(400))
    channel: Mapped[str | None] = mapped_column(String(200))
    duration_s: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TrackAnalysis(UUIDPk, Timestamped, Base):
    """Derived features for a track under one analyzer version (a cache shared by users).

    Failures are stored too, so permanently unavailable videos aren't re-downloaded.
    """

    __tablename__ = "track_analyses"
    __table_args__ = (UniqueConstraint("track_id", "analyzer_version"),)

    track_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"))
    analyzer_version: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))  # succeeded | failed
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_message: Mapped[str | None] = mapped_column(Text)
    features: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # Denormalised for the live listening map; recomputable from ``features``.
    brightness: Mapped[float | None] = mapped_column(Float)
    energy: Mapped[float | None] = mapped_column(Float)
    source_codec: Mapped[str | None] = mapped_column(String(32))
    bitrate_kbps: Mapped[float | None] = mapped_column(Float)
    download_seconds: Mapped[float | None] = mapped_column(Float)
    analysis_seconds: Mapped[float | None] = mapped_column(Float)


class MusicSubmission(UUIDPk, Timestamped, Base):
    """One "add music" request and its processing lifecycle."""

    __tablename__ = "music_submissions"
    __table_args__ = (Index("ix_music_submissions_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # queued -> resolving -> analyzing -> aggregating -> completed | failed
    status: Mapped[str] = mapped_column(String(20), default="queued")
    # Who chose the songs: "listener" (their own links) or "genre_picks" (AURALS,
    # from the genres they named). Every interface says which.
    origin: Mapped[str] = mapped_column(String(20), default="listener", server_default="listener")
    origin_genres: Mapped[str | None] = mapped_column(String(200))
    error_code: Mapped[str | None] = mapped_column(String(40))
    error_message: Mapped[str | None] = mapped_column(Text)
    music_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("music_profiles.id", ondelete="SET NULL", use_alter=True)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SubmissionSource(UUIDPk, Base):
    """A validated URL within a submission. Only the canonical form is stored."""

    __tablename__ = "submission_sources"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("music_submissions.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(16))  # video | playlist | spotify_playlist
    external_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str | None] = mapped_column(String(400))
    channel: Mapped[str | None] = mapped_column(String(200))
    # Artwork the source itself published, when it has any (Spotify playlist covers).
    cover_url: Mapped[str | None] = mapped_column(String(500))
    total_entries: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|resolved|failed
    error_code: Mapped[str | None] = mapped_column(String(40))


class SubmissionTrack(Base):
    """A track selected for a submission, with its per-submission processing state."""

    __tablename__ = "submission_tracks"
    __table_args__ = (Index("ix_submission_tracks_track_status", "track_id", "status"),)

    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("music_submissions.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("submission_sources.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(Integer)
    # queued | analyzing | done | failed | skipped
    status: Mapped[str] = mapped_column(String(16), default="queued")
    reason: Mapped[str | None] = mapped_column(String(40))
    # Where this track came from when it did not come from a YouTube link: the
    # original platform's metadata and how it was matched to the video we measure.
    # Provenance for the substitution, kept per submission rather than on the
    # shared ``tracks`` row, which describes the YouTube recording itself.
    imported: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MusicProfile(UUIDPk, Timestamped, Base):
    """An immutable snapshot of a user's listening representation."""

    __tablename__ = "music_profiles"
    __table_args__ = (Index("ix_music_profiles_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    submission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("music_submissions.id", ondelete="SET NULL")
    )
    version: Mapped[str] = mapped_column(String(32))
    analyzer_version: Mapped[str] = mapped_column(String(32))
    calibration: Mapped[str] = mapped_column(String(64))
    track_count: Mapped[int] = mapped_column(Integer)
    profile: Mapped[dict[str, Any]] = mapped_column(JSONB)
