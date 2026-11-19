"""Request-side music logic: creating submissions and reading their progress."""

from __future__ import annotations

import uuid
from collections import Counter

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auralis.analysis.aggregate import MusicProfileData
from auralis.analysis.version import ANALYZER_VERSION
from auralis.auth.models import User
from auralis.config import get_settings
from auralis.core.errors import DomainError, NotFound, RateLimited
from auralis.music.models import (
    MusicProfile,
    MusicSubmission,
    SubmissionSource,
    SubmissionTrack,
    Track,
    TrackAnalysis,
)
from auralis.music.pipeline import enqueue_ingest
from auralis.music.schemas import (
    LiveSpectrum,
    MusicProfileOut,
    ProfileTrack,
    SourceOut,
    Stage,
    SubmissionOut,
    SubmissionSummary,
    SubmissionTrackOut,
    TrackCounts,
    TrackPoint,
    UrlProblem,
)
from auralis.music.spotify import InvalidSpotifyUrl
from auralis.music.urls import InvalidYouTubeUrl, MusicRef, parse_music_url
from auralis.profiles.service import ACTIVE_STATUSES

# What each kind of pasted link is called on screen. Playlists name their platform
# because a submission can now mix the two.
SOURCE_WORD = {
    "video": "video",
    "playlist": "YouTube playlist",
    "spotify_playlist": "Spotify playlist",
}

# Every third point of the 1/6-octave analysis grid: a half-octave curve that is light
# enough to send for every track while keeping its shape.
COARSE_STEP = 3


def coarse(values: list[float]) -> list[float]:
    return [round(float(v), 1) for v in values[::COARSE_STEP]]


class InvalidSubmission(DomainError):
    status_code = 422
    code = "invalid_urls"

    def __init__(self, problems: list[UrlProblem]) -> None:
        super().__init__("Some links can't be used.")
        self.problems = problems


def create_submission(
    db: Session,
    user: User,
    urls: list[str],
    *,
    origin: str = "listener",
    genres: list[str] | None = None,
) -> MusicSubmission:
    settings = get_settings()
    refs: list[MusicRef] = []
    problems: list[UrlProblem] = []
    for index, raw in enumerate(urls):
        if not raw.strip():
            continue
        try:
            ref = parse_music_url(raw)
        except (InvalidYouTubeUrl, InvalidSpotifyUrl) as exc:
            problems.append(UrlProblem(index=index, url=raw[:200], code=exc.code, message=str(exc)))
            continue
        if all((r.kind, r.id) != (ref.kind, ref.id) for r in refs):
            refs.append(ref)
    if problems:
        raise InvalidSubmission(problems)
    if not refs:
        raise DomainError("Paste at least one YouTube or Spotify link.", code="no_urls")
    if len(refs) > settings.max_urls_per_submission:
        raise DomainError(
            f"Add up to {settings.max_urls_per_submission} links at a time.", code="too_many_urls"
        )

    active = db.scalar(
        select(func.count()).where(
            MusicSubmission.user_id == user.id, MusicSubmission.status.in_(ACTIVE_STATUSES)
        )
    )
    if (active or 0) >= settings.max_active_submissions_per_user:
        raise RateLimited("You already have music being analysed. Let it finish first.")

    submission = MusicSubmission(
        user_id=user.id,
        status="queued",
        origin=origin,
        origin_genres=",".join(genres) if genres else None,
    )
    db.add(submission)
    db.flush()
    for position, ref in enumerate(refs):
        db.add(
            SubmissionSource(
                submission_id=submission.id,
                position=position,
                kind=ref.kind,
                external_id=ref.id,
                status="pending",
            )
        )
    enqueue_ingest(db, submission.id)
    return submission


def _owned_submission(db: Session, user: User, submission_id: uuid.UUID) -> MusicSubmission:
    submission = db.get(MusicSubmission, submission_id)
    if submission is None or submission.user_id != user.id:
        raise NotFound("Submission not found.")
    return submission


def _stages(sub: MusicSubmission, sources: list[SourceOut], counts: TrackCounts) -> list[Stage]:
    status = sub.status
    selected = counts.total - counts.skipped
    resolved = sum(s.status == "resolved" for s in sources)
    past_resolve = status in {"analyzing", "aggregating", "completed"} or (
        status == "failed" and counts.total > 0
    )

    def state(active: bool, done: bool, failed: bool) -> str:
        return "failed" if failed else "done" if done else "active" if active else "pending"

    kinds = Counter(s.kind for s in sources)
    source_text = " + ".join(
        f"{n} {SOURCE_WORD.get(kind, kind)}{'s' if n != 1 else ''}"
        for kind, n in sorted(kinds.items(), reverse=True)
    )
    analysed = counts.done + counts.failed
    return [
        Stage(
            key="resolve",
            label="Finding your music",
            state=state(
                status in {"queued", "resolving"},
                past_resolve,
                status == "failed" and counts.total == 0,
            ),
            detail=(f"{source_text} · {counts.total} tracks found" if past_resolve else source_text)
            if resolved or not past_resolve
            else None,
        ),
        Stage(
            key="select",
            label="Curating tracks",
            state=state(False, past_resolve, False),
            detail=(
                f"{selected} selected"
                + (f" · {counts.skipped} set aside" if counts.skipped else "")
            )
            if past_resolve
            else None,
        ),
        Stage(
            key="analyze",
            label="Analysing acoustic characteristics",
            state=state(
                status == "analyzing",
                status in {"aggregating", "completed"},
                status == "failed" and past_resolve and counts.done == 0,
            ),
            detail=f"{analysed} of {selected} tracks" if past_resolve and selected else None,
        ),
        Stage(
            key="profile",
            label="Building your listening profile",
            state=state(
                status == "aggregating",
                status == "completed",
                status == "failed" and counts.done > 0,
            ),
            detail=None,
        ),
    ]


def get_submission(db: Session, user: User, submission_id: uuid.UUID) -> SubmissionOut:
    sub = _owned_submission(db, user, submission_id)
    sources = [
        SourceOut(
            kind=s.kind,
            external_id=s.external_id,
            title=s.title,
            channel=s.channel,
            total_entries=s.total_entries,
            status=s.status,
            error_code=s.error_code,
            cover_url=s.cover_url,
        )
        for s in db.scalars(
            select(SubmissionSource)
            .where(SubmissionSource.submission_id == sub.id)
            .order_by(SubmissionSource.position)
        )
    ]
    rows = db.execute(
        select(
            SubmissionTrack,
            Track,
            TrackAnalysis.brightness,
            TrackAnalysis.energy,
            TrackAnalysis.features["spectrum_db"],
        )
        .join(Track, Track.id == SubmissionTrack.track_id)
        .outerjoin(
            TrackAnalysis,
            (TrackAnalysis.track_id == Track.id)
            & (TrackAnalysis.analyzer_version == ANALYZER_VERSION),
        )
        .where(SubmissionTrack.submission_id == sub.id)
        .order_by(SubmissionTrack.position)
    ).all()

    counts = TrackCounts(total=len(rows))
    reasons: Counter[str] = Counter()
    tracks = []
    freqs: list[float] | None = None
    for st, track, brightness, energy, spectrum in rows:
        setattr(counts, st.status, getattr(counts, st.status) + 1)
        if st.reason:
            reasons[st.reason] += 1
        point = (
            TrackPoint(x=brightness, y=energy)
            if st.status == "done" and brightness is not None and energy is not None
            else None
        )
        done_spectrum = coarse(spectrum) if st.status == "done" and spectrum else None
        if done_spectrum and freqs is None:
            freqs = _coarse_freqs(db, track.id)
        tracks.append(
            SubmissionTrackOut(
                id=track.id,
                video_id=track.source_id,
                title=track.title,
                channel=track.channel,
                duration_s=track.duration_s,
                status=st.status,
                reason=st.reason,
                point=point,
                spectrum=done_spectrum,
                imported=st.imported,
            )
        )

    return SubmissionOut(
        id=sub.id,
        status=sub.status,
        error_code=sub.error_code,
        error_message=sub.error_message,
        created_at=sub.created_at,
        completed_at=sub.completed_at,
        music_profile_id=sub.music_profile_id,
        stages=_stages(sub, sources, counts),
        sources=sources,
        counts=counts,
        reasons=dict(reasons),
        tracks=tracks,
        live_spectrum=_live_spectrum(db, sub.id) if counts.done else None,
        spectrum_freqs_hz=freqs,
    )


def _coarse_freqs(db: Session, track_id: uuid.UUID) -> list[float] | None:
    freqs = db.scalar(
        select(TrackAnalysis.features["spectrum_freqs_hz"]).where(
            TrackAnalysis.track_id == track_id,
            TrackAnalysis.analyzer_version == ANALYZER_VERSION,
        )
    )
    return coarse(freqs) if freqs else None


def _live_spectrum(db: Session, submission_id: uuid.UUID) -> LiveSpectrum | None:
    """Median long-term spectrum over the tracks analysed so far (for the live view)."""
    rows = db.execute(
        select(TrackAnalysis.features["spectrum_freqs_hz"], TrackAnalysis.features["spectrum_db"])
        .join(SubmissionTrack, SubmissionTrack.track_id == TrackAnalysis.track_id)
        .where(
            SubmissionTrack.submission_id == submission_id,
            SubmissionTrack.status == "done",
            TrackAnalysis.analyzer_version == ANALYZER_VERSION,
            TrackAnalysis.status == "succeeded",
        )
    ).all()
    if not rows:
        return None
    freqs = min((r[0] for r in rows), key=len)
    matrix = np.array([r[1][: len(freqs)] for r in rows], dtype=np.float64)
    median = np.median(matrix, axis=0)
    return LiveSpectrum(
        freqs_hz=freqs, db=[round(float(v), 2) for v in median], track_count=len(rows)
    )


def list_submissions(db: Session, user: User, limit: int = 20) -> list[SubmissionSummary]:
    subs = db.scalars(
        select(MusicSubmission)
        .where(MusicSubmission.user_id == user.id)
        .order_by(MusicSubmission.created_at.desc())
        .limit(limit)
    ).all()
    if not subs:
        return []
    ids = [s.id for s in subs]
    titles: dict[uuid.UUID, list[str]] = {}
    for sid, title, kind, ext in db.execute(
        select(
            SubmissionSource.submission_id,
            SubmissionSource.title,
            SubmissionSource.kind,
            SubmissionSource.external_id,
        )
        .where(SubmissionSource.submission_id.in_(ids))
        .order_by(SubmissionSource.position)
    ):
        titles.setdefault(sid, []).append(title or f"{kind} {ext}")
    counts: dict[uuid.UUID, TrackCounts] = {sid: TrackCounts() for sid in ids}
    for sid, status, n in db.execute(
        select(SubmissionTrack.submission_id, SubmissionTrack.status, func.count())
        .where(SubmissionTrack.submission_id.in_(ids))
        .group_by(SubmissionTrack.submission_id, SubmissionTrack.status)
    ):
        c = counts[sid]
        setattr(c, status, n)
        c.total += n
    return [
        SubmissionSummary(
            id=s.id,
            status=s.status,
            created_at=s.created_at,
            completed_at=s.completed_at,
            source_titles=titles.get(s.id, []),
            counts=counts[s.id],
        )
        for s in subs
    ]


def _playlist_title(db: Session, submission_id: uuid.UUID | None) -> str | None:
    """The playlist's own title, only when the music came from one playlist alone."""
    if submission_id is None:
        return None
    sources = list(
        db.execute(
            select(SubmissionSource.kind, SubmissionSource.title).where(
                SubmissionSource.submission_id == submission_id
            )
        )
    )
    if len(sources) != 1 or sources[0].kind == "video":
        return None
    title = (sources[0].title or "").strip()
    return title or None


def get_music_profile(
    db: Session, user: User, profile_id: uuid.UUID | None = None
) -> MusicProfileOut:
    query = select(MusicProfile).where(MusicProfile.user_id == user.id)
    if profile_id is not None:
        query = query.where(MusicProfile.id == profile_id)
    profile = db.scalar(query.order_by(MusicProfile.created_at.desc()).limit(1))
    if profile is None:
        raise NotFound("No music profile yet.", code="no_music_profile")
    data = MusicProfileData.model_validate(profile.profile)
    ids = [uuid.UUID(p.track_id) for p in data.map]
    tracks = {
        str(t.id): ProfileTrack(id=t.id, video_id=t.source_id, title=t.title, channel=t.channel)
        for t in db.scalars(select(Track).where(Track.id.in_(ids)))
    }
    spectra = {
        str(track_id): coarse(spectrum)
        for track_id, spectrum in db.execute(
            select(TrackAnalysis.track_id, TrackAnalysis.features["spectrum_db"]).where(
                TrackAnalysis.track_id.in_(ids),
                TrackAnalysis.analyzer_version == ANALYZER_VERSION,
                TrackAnalysis.status == "succeeded",
            )
        )
        if spectrum
    }
    return MusicProfileOut(
        playlist_title=_playlist_title(db, profile.submission_id),
        **_origin(db, profile.submission_id),
        id=profile.id,
        created_at=profile.created_at,
        submission_id=profile.submission_id,
        track_count=profile.track_count,
        data=data,
        tracks=tracks,
        spectrum_freqs_hz=coarse(data.spectrum.freqs_hz),
        track_spectra=spectra,
    )


def _origin(db: Session, submission_id: uuid.UUID | None) -> dict[str, object]:
    """Who chose the songs a music profile was read from."""
    row = db.get(MusicSubmission, submission_id) if submission_id else None
    if row is None or row.origin != "genre_picks":
        return {"origin": "listener", "origin_genres": []}
    return {"origin": "genre_picks", "origin_genres": (row.origin_genres or "").split(",")}
