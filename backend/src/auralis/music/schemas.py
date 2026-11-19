from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from auralis.analysis.aggregate import MusicProfileData
from auralis.profiles.schemas import UseCase

SubmissionStatus = Literal["queued", "resolving", "analyzing", "aggregating", "completed", "failed"]
SourceKind = Literal["video", "playlist", "spotify_playlist"]
TrackStatus = Literal["queued", "analyzing", "done", "failed", "skipped"]
StageState = Literal["pending", "active", "done", "failed"]


class SubmissionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    urls: list[str] = Field(min_length=1, max_length=50)


class PicksCreate(BaseModel):
    """Genres to choose songs from, for a listener without a playlist to hand."""

    model_config = ConfigDict(extra="forbid")

    genres: list[UseCase] = Field(min_length=1, max_length=7)


class UrlProblem(BaseModel):
    index: int
    url: str
    code: str
    message: str


class Stage(BaseModel):
    key: Literal["resolve", "select", "analyze", "profile"]
    label: str
    state: StageState
    detail: str | None = None


class SourceOut(BaseModel):
    kind: SourceKind
    external_id: str
    title: str | None
    channel: str | None
    total_entries: int | None
    status: Literal["pending", "resolved", "failed"]
    error_code: str | None
    cover_url: str | None = Field(
        default=None, description="Artwork published by the source itself, if any"
    )


class ImportedFrom(BaseModel):
    """Where a track came from when it was not a pasted YouTube link.

    Auralis measures the YouTube recording it found, never the original platform's
    audio. This records what was asked for and how closely the video answered, so
    the substitution is visible rather than silent.
    """

    source: Literal["spotify"]
    id: str
    title: str
    artist: str | None = None
    artwork_url: str | None = None
    confident: bool = Field(description="Title and length both agreed with the request")
    match_note: str = Field(description="Plain-language account of how it was matched")


class TrackPoint(BaseModel):
    x: float
    y: float


class SubmissionTrackOut(BaseModel):
    id: uuid.UUID
    video_id: str
    title: str | None
    channel: str | None
    duration_s: float | None
    status: TrackStatus
    reason: str | None
    point: TrackPoint | None
    spectrum: list[float] | None = Field(
        default=None, description="Coarse long-term spectrum (dB) on spectrum_freqs_hz"
    )
    imported: ImportedFrom | None = None


class TrackCounts(BaseModel):
    total: int = 0
    queued: int = 0
    analyzing: int = 0
    done: int = 0
    failed: int = 0
    skipped: int = 0


class LiveSpectrum(BaseModel):
    freqs_hz: list[float]
    db: list[float]
    track_count: int


class SubmissionOut(BaseModel):
    id: uuid.UUID
    status: SubmissionStatus
    error_code: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    music_profile_id: uuid.UUID | None
    stages: list[Stage]
    sources: list[SourceOut]
    counts: TrackCounts
    reasons: dict[str, int]
    tracks: list[SubmissionTrackOut]
    live_spectrum: LiveSpectrum | None
    spectrum_freqs_hz: list[float] | None


class SubmissionSummary(BaseModel):
    id: uuid.UUID
    status: SubmissionStatus
    created_at: datetime
    completed_at: datetime | None
    source_titles: list[str]
    counts: TrackCounts


class ProfileTrack(BaseModel):
    id: uuid.UUID
    video_id: str
    title: str | None
    channel: str | None


class MusicProfileOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    submission_id: uuid.UUID | None
    track_count: int
    data: MusicProfileData
    tracks: dict[str, ProfileTrack]
    spectrum_freqs_hz: list[float]
    track_spectra: dict[str, list[float]] = Field(
        description="Coarse long-term spectrum per track id, on spectrum_freqs_hz"
    )
    playlist_title: str | None = Field(
        default=None,
        description="The playlist's own title, when the music came from exactly one playlist",
    )
    origin: Literal["listener", "genre_picks"] = Field(
        default="listener",
        description="genre_picks: AURALS chose these songs from genres the listener named",
    )
    origin_genres: list[str] = Field(default_factory=list)


class LinkPreviewOut(BaseModel):
    kind: SourceKind
    id: str
    title: str | None
    author: str | None
    thumbnail_video_id: str | None
    thumbnail_url: str | None = None
    available: bool
