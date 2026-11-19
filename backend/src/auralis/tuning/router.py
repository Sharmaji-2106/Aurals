from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from auralis.auth.deps import CurrentUser, DbSession
from auralis.core.errors import NotFound
from auralis.profiles.models import Profile
from auralis.sound_profile.service import SoundProfileOut, rebuild_sound_profile, to_out
from auralis.tuning import clip as clips
from auralis.tuning import devices
from auralis.tuning import examples as question_examples
from auralis.tuning.inference import Choice, consistency, duel_beliefs
from auralis.tuning.jobs import enqueue_examples
from auralis.tuning.models import TuningSession
from auralis.tuning.shapes import SHAPES, Shape

router = APIRouter(prefix="/api/tuning", tags=["tuning"])

SESSION_VERSION = "tuning/1"


class ClipOut(BaseModel):
    """The clip the duel plays, or why there is none (then a synthesised bed is used)."""

    status: Literal["ready", "none"]
    title: str | None = None
    artist: str | None = None
    start_s: float | None = None
    duration_s: float | None = None
    view_count: int | None = None
    audio_url: str | None = None


class ChoiceIn(BaseModel):
    dimension: Literal["sub_bass", "mid_bass", "warmth", "vocal_presence", "treble", "air"]
    center_db: float = Field(ge=-15, le=15)
    delta_db: float = Field(gt=0, le=8)
    picked: Literal["plus", "minus", "same"]
    repeat_of: int | None = Field(default=None, ge=0, le=40)


class TuningSessionIn(BaseModel):
    shape: str | None = Field(default=None, max_length=32)
    device_slug: str | None = Field(default=None, max_length=200)
    device_kind: Literal["catalogue", "earbuds", "over_ear", "unknown"] = "unknown"
    clip_title: str | None = Field(default=None, max_length=300)
    choices: list[ChoiceIn] = Field(default_factory=list, max_length=40)


class DimensionResult(BaseModel):
    dimension: str
    mean_db: float
    sd_db: float
    trials: int


class TuningSessionOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    shape: str | None
    device: dict[str, object] | None
    consistency: Literal["consistent", "mixed", "untested"]
    duel: list[DimensionResult]
    sound_profile: SoundProfileOut


@router.get("/shapes")
def read_shapes() -> list[Shape]:
    return list(SHAPES)


@router.get("/clip")
def read_clip(user: CurrentUser, db: DbSession) -> ClipOut:
    meta = clips.prepare(db, user.id)
    if meta is None:
        return ClipOut(status="none")
    return ClipOut(
        status="ready",
        title=meta.title,
        artist=meta.artist,
        start_s=meta.start_s,
        duration_s=meta.duration_s,
        view_count=meta.view_count,
        audio_url=f"/api/tuning/clip/audio?v={int(meta.made_at)}",
    )


class ExampleOut(BaseModel):
    question: str
    title: str
    artist: str
    start_s: float
    duration_s: float
    audio_url: str


class ExamplesOut(BaseModel):
    """The questionnaire's examples from the listener's own songs, or why not yet."""

    status: Literal["ready", "preparing", "none"]
    items: list[ExampleOut]


def _examples(
    found: tuple[question_examples.Status, list[question_examples.Example]],
) -> ExamplesOut:
    state, items = found
    return ExamplesOut(
        status=state,
        items=[
            ExampleOut(
                question=e.question,
                title=e.title,
                artist=e.artist,
                start_s=e.start_s,
                duration_s=e.duration_s,
                audio_url=f"/api/tuning/examples/{e.question}/audio?v={int(e.start_s * 10)}",
            )
            for e in items
        ],
    )


@router.post("/examples")
def start_examples(user: CurrentUser, db: DbSession) -> ExamplesOut:
    """Starts making the examples (once per playlist) and says where they are."""
    found = question_examples.status(db, user.id)
    if found[0] == "preparing":
        songs = clips._songs(db, user.id)
        if songs is not None:
            enqueue_examples(db, user.id, songs[0])
            db.commit()
    return _examples(found)


@router.get("/examples")
def read_examples(user: CurrentUser, db: DbSession) -> ExamplesOut:
    return _examples(question_examples.status(db, user.id))


@router.get("/examples/{question}/audio", response_class=FileResponse)
def read_example_audio(question: str, user: CurrentUser) -> FileResponse:
    path = question_examples.example_path(user.id, question)
    if path is None:
        raise NotFound("No example has been prepared for this question.", code="no_example")
    return FileResponse(
        path, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"}
    )


class SongOut(BaseModel):
    video_id: str
    title: str
    artist: str
    duration_s: float | None


@router.get("/songs")
def read_songs(user: CurrentUser, db: DbSession) -> list[SongOut]:
    """The listener's analysed songs, to choose their own for the listening session."""
    songs = clips._songs(db, user.id)
    if songs is None:
        return []
    return [
        SongOut(
            video_id=t.source_id,
            title=t.title or "",
            artist=t.channel or "",
            duration_s=t.duration_s,
        )
        for t in songs[1]
    ]


@router.get("/songs/{video_id}/audio", response_class=FileResponse)
def read_song_audio(video_id: str, user: CurrentUser, db: DbSession) -> FileResponse:
    path = clips.song_file(db, user.id, video_id)
    if path is None:
        raise NotFound("That song isn't in your playlist.", code="no_song")
    return FileResponse(
        path,
        media_type=clips.SONG_TYPES.get(path.suffix, "application/octet-stream"),
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/clip/audio", response_class=FileResponse)
def read_clip_audio(user: CurrentUser) -> FileResponse:
    path = clips.audio_path(user.id)
    if path is None:
        raise NotFound("No clip has been prepared.", code="no_clip")
    return FileResponse(
        path, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"}
    )


@router.get("/devices")
def search_devices(
    db: DbSession, q: Annotated[str, Query(max_length=80)] = ""
) -> list[devices.DeviceOut]:
    return devices.search(db, q)


@router.get("/devices/popular")
def popular_devices(db: DbSession, headphones: bool = False) -> list[devices.DeviceOut]:
    return devices.popular(db, headphones=headphones)


@router.get("/devices/{slug}")
def device_detail(slug: str, db: DbSession) -> devices.DeviceDetail:
    found = devices.detail(db, slug)
    if found is None:
        raise NotFound("No measured device by that name.", code="no_device")
    return found


def _session_out(row: TuningSession, profile: SoundProfileOut) -> TuningSessionOut:
    parsed = [Choice.parse(c) for c in row.choices]
    label, _ = consistency(parsed)
    counts: dict[str, int] = {}
    for c in parsed:
        counts[c.dimension] = counts.get(c.dimension, 0) + 1
    duel = [
        DimensionResult(
            dimension=d, mean_db=round(b.mean, 2), sd_db=round(b.var**0.5, 2), trials=counts[d]
        )
        for d, b in duel_beliefs(parsed).items()
    ]
    return TuningSessionOut(
        id=row.id,
        created_at=row.created_at,
        shape=row.shape,
        device=row.device,
        consistency=label,
        duel=duel,
        sound_profile=profile,
    )


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(body: TuningSessionIn, user: CurrentUser, db: DbSession) -> TuningSessionOut:
    device: dict[str, object] | None = {"kind": body.device_kind}
    if body.device_kind == "catalogue" and body.device_slug:
        found = devices.profile(db, body.device_slug)
        known = devices.detail(db, body.device_slug) if found is None else None
        if found is not None:
            device = {
                "kind": "catalogue",
                "slug": found.slug,
                "label": found.label,
                "offsets": found.offsets,
            }
        elif known is not None:
            # Identified, but measured on another rig: remembered, not corrected for.
            device = {"kind": "measured_elsewhere", "slug": known.slug, "label": known.label}
        else:
            device = {"kind": "unknown"}
        _remember_gear(db, user.id, device.get("label"))
    row = TuningSession(
        user_id=user.id,
        version=SESSION_VERSION,
        shape=body.shape if body.shape in {s.key for s in SHAPES} else None,
        device=device,
        clip={"title": body.clip_title} if body.clip_title else None,
        choices=[c.model_dump() for c in body.choices],
    )
    db.add(row)
    db.flush()
    profile = rebuild_sound_profile(db, user.id)
    db.commit()
    return _session_out(row, to_out(profile))


def _remember_gear(db: DbSession, user_id: uuid.UUID, label: object) -> None:
    """What they listen with today, kept with the profile for the questions after."""
    if not isinstance(label, str) or not label:
        return
    profile = db.get(Profile, user_id)
    if profile is None or label in profile.current_gear:
        return
    profile.current_gear = [label, *profile.current_gear][:10]


@router.get("/sessions/latest")
def latest_session(user: CurrentUser, db: DbSession) -> TuningSessionOut:
    row = db.scalar(
        select(TuningSession)
        .where(TuningSession.user_id == user.id)
        .order_by(TuningSession.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise NotFound("No listening session yet.", code="no_tuning_session")
    from auralis.sound_profile.service import latest_sound_profile

    return _session_out(row, latest_sound_profile(db, user))
