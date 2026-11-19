from __future__ import annotations

import uuid

from fastapi import APIRouter, Query, status

from auralis.auth.deps import CurrentUser, DbSession
from auralis.core.errors import DomainError
from auralis.music import preview, service
from auralis.music.schemas import (
    LinkPreviewOut,
    MusicProfileOut,
    PicksCreate,
    SubmissionCreate,
    SubmissionOut,
    SubmissionSummary,
)
from auralis.music.spotify import InvalidSpotifyUrl
from auralis.music.urls import InvalidYouTubeUrl, parse_music_url

router = APIRouter(prefix="/api/music", tags=["music"])


@router.post("/submissions", status_code=status.HTTP_202_ACCEPTED)
def create_submission(body: SubmissionCreate, user: CurrentUser, db: DbSession) -> SubmissionOut:
    """Validate YouTube and Spotify links and queue them for analysis."""
    submission = service.create_submission(db, user, body.urls)
    db.commit()
    return service.get_submission(db, user, submission.id)


@router.post("/picks", status_code=status.HTTP_202_ACCEPTED)
def create_picks(body: PicksCreate, user: CurrentUser, db: DbSession) -> SubmissionOut:
    """No playlist to hand: AURALS chooses well-known songs from the named genres.

    Measured like any playlist, recorded as AURALS's choice (``origin``), and the
    genres are kept on the profile, where they also lean the sound a little.
    """
    from auralis.music.picks import urls_for
    from auralis.profiles.models import Profile

    genres: list[str] = list(dict.fromkeys(body.genres))
    urls = urls_for(genres)
    if not urls:
        raise DomainError("No songs are on file for those genres yet.", code="no_picks")
    submission = service.create_submission(db, user, urls, origin="genre_picks", genres=genres)
    profile = db.get(Profile, user.id)
    if profile is not None:
        profile.use_cases = list(dict.fromkeys([*(profile.use_cases or []), *genres]))
        profile.primary_use_case = profile.primary_use_case or genres[0]
    db.commit()
    return service.get_submission(db, user, submission.id)


@router.get("/submissions")
def list_submissions(user: CurrentUser, db: DbSession) -> list[SubmissionSummary]:
    return service.list_submissions(db, user)


@router.get("/submissions/{submission_id}")
def read_submission(submission_id: uuid.UUID, user: CurrentUser, db: DbSession) -> SubmissionOut:
    return service.get_submission(db, user, submission_id)


@router.get("/profile")
def read_music_profile(user: CurrentUser, db: DbSession) -> MusicProfileOut:
    """The latest listening representation built from all of the user's music."""
    return service.get_music_profile(db, user)


@router.get("/link-preview")
def link_preview(user: CurrentUser, url: str = Query(max_length=2048)) -> LinkPreviewOut:
    """Title and artwork for a pasted link, for display while editing."""
    try:
        ref = parse_music_url(url)
    except (InvalidYouTubeUrl, InvalidSpotifyUrl) as exc:
        raise DomainError(str(exc), code=exc.code) from exc
    result = preview.preview(ref)
    return LinkPreviewOut(
        kind=ref.kind,
        id=ref.id,
        title=result.title,
        author=result.author,
        thumbnail_video_id=result.thumbnail_video_id,
        thumbnail_url=result.thumbnail_url,
        available=result.available,
    )
