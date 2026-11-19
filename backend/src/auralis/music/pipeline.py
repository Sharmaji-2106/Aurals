"""Job handlers for the music pipeline.

::

    music.ingest         resolve sources -> select tracks -> reuse cached analyses
                         -> enqueue music.analyze_track for the rest
    music.analyze_track  download -> decode -> features (shared cache per track)
                         -> mark waiting submissions -> maybe enqueue music.build_profile
    music.build_profile  curate + aggregate the user's library -> MusicProfile
                         -> rebuild the personal sound profile

Network and CPU work happens outside database transactions; each state change is
committed on its own so the UI sees progress as it happens.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from auralis.analysis.aggregate import build_profile as aggregate_profile
from auralis.analysis.curation import CurationTrack
from auralis.analysis.decode import AudioDecodeError
from auralis.analysis.descriptors import describe
from auralis.analysis.features import TrackFeatures, TrackRejected
from auralis.analysis.version import ANALYZER_VERSION, MUSIC_PROFILE_VERSION
from auralis.config import get_settings
from auralis.core.time import utcnow
from auralis.db import session_scope
from auralis.jobs.queue import enqueue
from auralis.jobs.registry import JobContext, RetryJob, job_handler
from auralis.music import acquire, selection, spotify, youtube
from auralis.music.models import (
    MusicProfile,
    MusicSubmission,
    SubmissionSource,
    SubmissionTrack,
    Track,
    TrackAnalysis,
)
from auralis.music.spotify import SpotifyRef
from auralis.music.urls import MusicRef, YouTubeRef

log = logging.getLogger(__name__)

KIND_INGEST = "music.ingest"
KIND_ANALYZE = "music.analyze_track"
KIND_BUILD = "music.build_profile"

# Failures that won't change on retry; cached so we don't hammer YouTube for them.
PERMANENT_FAILURES = frozenset(
    {
        "private",
        "unavailable",
        "age_restricted",
        "geo_blocked",
        "members_only",
        "too_long",
        "too_large",
        "too_short",
        "silent",
        "decode_failed",
        "live",
    }
)
PENDING = ("queued", "analyzing")
RESOLVE_CONCURRENCY = 6
# Spotify tracks are looked up on YouTube one search at a time; a few in parallel
# keeps a long playlist moving without flooding the extractor.
MATCH_CONCURRENCY = 4


# How each reason a track is set aside reads to the listener.
_SET_ASIDE = {
    "too_long": "{n} longer than {max_minutes} minutes",
    "too_short": "{n} too short to measure",
    "altered_version": "{n} sped-up, slowed or otherwise altered",
    "duplicate": "{n} repeated",
}


def nothing_playable(reasons: Counter[str], *, max_minutes: int) -> str:
    """Why a submission had nothing to analyse, in words a listener can act on.

    "None of the tracks could be analysed" left people guessing. Most often the
    cause is a playlist of long DJ mixes: a 45-minute mix averages dozens of
    songs into one spectrum, so it is set aside by design, and saying so is
    what lets the listener fix it.
    """
    total = sum(reasons.values())
    if total and reasons.get("too_long", 0) == total:
        return (
            f"All {total} tracks are longer than {max_minutes} minutes. Long mixes blend many "
            "songs into one, so they are set aside. Try a playlist of individual songs."
        )
    if not total:
        return "None of the tracks could be analysed."
    parts = []
    for reason, count in reasons.most_common():
        template = _SET_ASIDE.get(reason)
        if template:
            parts.append(template.format(n=count, max_minutes=max_minutes))
        else:
            parts.append(f"{count} unavailable")
    return f"None of the {total} tracks could be analysed: " + ", ".join(parts) + "."


@dataclass(frozen=True, slots=True)
class Resolution:
    """A source's track list, however that source had to be read.

    Imported sources (Spotify) also carry the artwork the platform published and,
    per matched video, a record of what was asked for and how the video answered.
    """

    title: str | None
    channel: str | None
    tracks: list[youtube.TrackMeta]
    total_entries: int | None
    cover_url: str | None = None
    imported: dict[str, dict[str, Any]] = field(default_factory=dict)


def _ref(kind: str, external_id: str) -> MusicRef:
    if kind == "spotify_playlist":
        return SpotifyRef("spotify_playlist", external_id)
    return YouTubeRef(kind, external_id)  # type: ignore[arg-type]


def _resolve_spotify(ref: SpotifyRef) -> Resolution:
    """Read a Spotify playlist, then find each of its songs on YouTube.

    Only the YouTube recording is ever measured: Spotify streams protected audio and
    the clip in its payload is a preview, not the track. Every match is stored with
    the request that produced it, so a substitution stays visible on screen rather
    than quietly becoming part of the listener's measured library.
    """
    playlist = spotify.fetch_playlist(ref)
    order = {track.track_id: i for i, track in enumerate(playlist.tracks)}
    found: dict[str, tuple[int, youtube.TrackMeta, dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=MATCH_CONCURRENCY) as pool:
        futures = {
            pool.submit(youtube.search, track.query, want_seconds=track.duration_s): track
            for track in playlist.tracks
            if track.playable
        }
        for future in as_completed(futures):
            track = futures[future]
            try:
                match = future.result()
            except youtube.YouTubeError as exc:
                log.info("no YouTube match for %r: %s", track.query, exc)
                continue
            # Two playlist entries can land on the same video (a single and its
            # album cut). The earlier one keeps it; the other simply drops.
            if match is None or match.meta.video_id in found:
                continue
            found[match.meta.video_id] = (
                order.get(track.track_id, len(order)),
                match.meta,
                {
                    "source": "spotify",
                    "id": track.track_id,
                    "title": track.title,
                    "artist": track.artist,
                    "artwork_url": playlist.cover_url,
                    "confident": match.confident,
                    "match_note": match.note,
                },
            )
    if not found:
        raise spotify.SpotifyError(
            "spotify_no_matches", "None of those songs could be found on YouTube."
        )
    ordered = sorted(found.values(), key=lambda row: row[0])
    return Resolution(
        title=playlist.name,
        channel=playlist.owner,
        tracks=[meta for _, meta, _ in ordered],
        total_entries=len(playlist.tracks),
        cover_url=playlist.cover_url,
        imported={meta.video_id: record for _, meta, record in ordered},
    )


def _resolve(ref: MusicRef) -> Resolution:
    if isinstance(ref, SpotifyRef):
        return _resolve_spotify(ref)
    source = youtube.resolve(ref)
    return Resolution(
        title=source.title,
        channel=source.channel,
        tracks=source.tracks,
        total_entries=source.total_entries,
    )


def enqueue_ingest(session: Session, submission_id: uuid.UUID) -> None:
    enqueue(
        session,
        KIND_INGEST,
        {"submission_id": str(submission_id)},
        dedupe_key=f"ingest:{submission_id}",
        priority=10,
    )


# --- ingest -----------------------------------------------------------------------------


def _fail_submission(payload: dict[str, Any], error: str, code: str = "processing_failed") -> None:
    with session_scope() as s:
        sub = s.get(MusicSubmission, uuid.UUID(payload["submission_id"]))
        if sub and sub.status not in ("completed", "failed"):
            sub.status = "failed"
            sub.error_code = code
            sub.error_message = error[:500]
            sub.completed_at = utcnow()


@job_handler(KIND_INGEST, on_exhausted=_fail_submission)
def ingest(payload: dict[str, Any], ctx: JobContext) -> None:
    settings = get_settings()
    submission_id = uuid.UUID(payload["submission_id"])
    with session_scope() as s:
        sub = s.get(MusicSubmission, submission_id)
        if sub is None or sub.status not in ("queued", "resolving"):
            return
        sub.status = "resolving"
        sources = [
            (src.id, _ref(src.kind, src.external_id))
            for src in s.scalars(
                select(SubmissionSource)
                .where(SubmissionSource.submission_id == submission_id)
                .order_by(SubmissionSource.position)
            )
        ]

    # Resolve every source before writing anything, so a retry starts clean. Lookups are
    # network-bound, so a handful run in parallel.
    resolved: dict[uuid.UUID, Resolution] = {}
    failures: dict[uuid.UUID, str] = {}
    with ThreadPoolExecutor(max_workers=RESOLVE_CONCURRENCY) as pool:
        futures = {pool.submit(_resolve, ref): source_id for source_id, ref in sources}
        for future in as_completed(futures):
            source_id = futures[future]
            try:
                resolved[source_id] = future.result()
            except (youtube.YouTubeError, spotify.SpotifyError) as exc:
                if exc.retryable and not ctx.job.is_last_attempt:
                    raise
                failures[source_id] = exc.code

    order = {sid: i for i, (sid, _) in enumerate(sources)}
    candidates = [
        selection.Candidate(meta, order[sid])
        for sid, _ in sources
        if sid in resolved
        for meta in resolved[sid].tracks
    ]
    decisions = selection.select(
        candidates,
        min_seconds=settings.min_track_seconds,
        max_seconds=settings.max_track_seconds,
        max_tracks=settings.max_tracks_per_submission,
    )

    with session_scope() as s:
        sub = s.get(MusicSubmission, submission_id, with_for_update=True)
        if sub is None or sub.status != "resolving":
            return
        for src in s.scalars(
            select(SubmissionSource).where(SubmissionSource.submission_id == submission_id)
        ):
            if src.id in resolved:
                info = resolved[src.id]
                src.title, src.channel = info.title, info.channel
                src.total_entries = info.total_entries
                src.cover_url = info.cover_url
                src.status = "resolved"
            else:
                src.status, src.error_code = "failed", failures.get(src.id, "unknown")

        track_ids = _upsert_tracks(s, [d.candidate.meta for d in decisions])
        source_ids = [sid for sid, _ in sources]
        # Where a track was imported rather than pasted, the provenance travels
        # with the row that records it in this submission.
        provenance = {
            video_id: record
            for info in resolved.values()
            for video_id, record in info.imported.items()
        }
        for position, decision in enumerate(decisions):
            video_id = decision.candidate.meta.video_id
            s.add(
                SubmissionTrack(
                    submission_id=submission_id,
                    track_id=track_ids[video_id],
                    source_id=source_ids[decision.candidate.source_index],
                    position=position,
                    status="queued" if decision.selected else "skipped",
                    reason=decision.reason,
                    imported=provenance.get(video_id),
                )
            )

        selected = [track_ids[d.candidate.meta.video_id] for d in decisions if d.selected]
        if not selected:
            sub.status = "failed"
            sub.error_code = "no_sources_resolved" if not resolved else "no_playable_tracks"
            sub.error_message = (
                "We couldn't open any of those links."
                if not resolved
                else nothing_playable(
                    Counter(d.reason for d in decisions if not d.selected and d.reason),
                    max_minutes=settings.max_track_seconds // 60,
                )
            )
            sub.completed_at = utcnow()
            return

        cached = {
            a.track_id: a
            for a in s.scalars(
                select(TrackAnalysis).where(
                    TrackAnalysis.track_id.in_(selected),
                    TrackAnalysis.analyzer_version == ANALYZER_VERSION,
                )
            )
        }
        s.flush()
        for track_id in selected:
            analysis = cached.get(track_id)
            if analysis and analysis.status == "succeeded":
                _set_track_status(s, track_id, "done", submission_id=submission_id)
            elif analysis and analysis.error_code in PERMANENT_FAILURES:
                _set_track_status(
                    s, track_id, "failed", analysis.error_code, submission_id=submission_id
                )
            else:
                enqueue(
                    s,
                    KIND_ANALYZE,
                    {"track_id": str(track_id)},
                    dedupe_key=f"analyze:{track_id}:{ANALYZER_VERSION}",
                    priority=50,
                )
        sub.status = "analyzing"
    maybe_finalize(submission_id)


def _upsert_tracks(s: Session, metas: list[youtube.TrackMeta]) -> dict[str, uuid.UUID]:
    if not metas:
        return {}
    base = insert(Track).values(
        [
            {
                "id": uuid.uuid4(),
                "source": "youtube",
                "source_id": m.video_id,
                "title": m.title,
                "channel": m.channel,
                "duration_s": m.duration_s,
            }
            for m in metas
        ]
    )
    stmt = base.on_conflict_do_update(
        index_elements=["source", "source_id"],
        set_={
            "title": func.coalesce(base.excluded.title, Track.title),
            "channel": func.coalesce(base.excluded.channel, Track.channel),
            "duration_s": func.coalesce(base.excluded.duration_s, Track.duration_s),
        },
    ).returning(Track.source_id, Track.id)
    return {row.source_id: row.id for row in s.execute(stmt)}


def _set_track_status(
    s: Session,
    track_id: uuid.UUID,
    status: str,
    reason: str | None = None,
    *,
    submission_id: uuid.UUID | None = None,
) -> None:
    stmt = update(SubmissionTrack).where(
        SubmissionTrack.track_id == track_id, SubmissionTrack.status.in_(PENDING)
    )
    if submission_id is not None:
        stmt = stmt.where(SubmissionTrack.submission_id == submission_id)
    s.execute(stmt.values(status=status, reason=reason))


# --- analyze ----------------------------------------------------------------------------


def _store_analysis(s: Session, track_id: uuid.UUID, **values: Any) -> None:
    row = {"id": uuid.uuid4(), "track_id": track_id, "analyzer_version": ANALYZER_VERSION, **values}
    stmt = insert(TrackAnalysis).values(row)
    s.execute(
        stmt.on_conflict_do_update(
            index_elements=["track_id", "analyzer_version"],
            set_={k: stmt.excluded[k] for k in values} | {"created_at": func.now()},
        )
    )


def _record_failure(track_id: uuid.UUID, code: str, message: str) -> None:
    log.info("track %s failed: %s (%s)", track_id, code, message[:200])
    with session_scope() as s:
        _store_analysis(
            s,
            track_id,
            status="failed",
            error_code=code,
            error_message=message[:1000],
            features=None,
            brightness=None,
            energy=None,
        )
        _set_track_status(s, track_id, "failed", code)
    _finalize_waiting(track_id)


def _analysis_exhausted(payload: dict[str, Any], error: str) -> None:
    _record_failure(uuid.UUID(payload["track_id"]), "processing_failed", error)


@job_handler(KIND_ANALYZE, on_exhausted=_analysis_exhausted)
def analyze_track(payload: dict[str, Any], ctx: JobContext) -> None:
    track_id = uuid.UUID(payload["track_id"])
    with session_scope() as s:
        track = s.get(Track, track_id)
        if track is None:
            return
        existing = s.scalar(
            select(TrackAnalysis.status).where(
                TrackAnalysis.track_id == track_id,
                TrackAnalysis.analyzer_version == ANALYZER_VERSION,
            )
        )
        if existing == "succeeded":
            _set_track_status(s, track_id, "done")
            video_id = None
        else:
            s.execute(
                update(SubmissionTrack)
                .where(SubmissionTrack.track_id == track_id, SubmissionTrack.status == "queued")
                .values(status="analyzing")
            )
            video_id = track.source_id
    if video_id is None:
        _finalize_waiting(track_id)
        return

    try:
        result = acquire.fetch_and_extract(video_id)
    except youtube.YouTubeError as exc:
        if not exc.retryable or ctx.job.is_last_attempt:
            _record_failure(
                track_id, exc.code if not exc.retryable else "processing_failed", str(exc)
            )
            return
        _requeue_status(track_id)
        if exc.code in {"bot_check", "rate_limited"}:
            raise RetryJob(str(exc), delay_seconds=120 * ctx.job.attempts) from exc
        raise
    except AudioDecodeError as exc:
        _record_failure(track_id, "decode_failed", str(exc))
        return
    except TrackRejected as exc:
        _record_failure(track_id, exc.code, str(exc))
        return
    except Exception:
        if not ctx.job.is_last_attempt:
            _requeue_status(track_id)
        raise

    descriptors = describe(result.features)
    with session_scope() as s:
        _store_analysis(
            s,
            track_id,
            status="succeeded",
            error_code=None,
            error_message=None,
            features=result.features.model_dump(mode="json"),
            brightness=descriptors.values["brightness"],
            energy=descriptors.values["energy"],
            source_codec=result.codec,
            bitrate_kbps=result.bitrate_kbps,
            download_seconds=result.download_seconds,
            analysis_seconds=result.analysis_seconds,
        )
        track = s.get(Track, track_id)
        if track is not None:
            track.title = result.meta.title or track.title
            track.channel = result.meta.channel or track.channel
            track.duration_s = result.meta.duration_s or track.duration_s
        _set_track_status(s, track_id, "done")
    _finalize_waiting(track_id)


def _requeue_status(track_id: uuid.UUID) -> None:
    with session_scope() as s:
        s.execute(
            update(SubmissionTrack)
            .where(SubmissionTrack.track_id == track_id, SubmissionTrack.status == "analyzing")
            .values(status="queued")
        )


def _finalize_waiting(track_id: uuid.UUID) -> None:
    with session_scope() as s:
        submission_ids = s.scalars(
            select(SubmissionTrack.submission_id)
            .join(MusicSubmission, MusicSubmission.id == SubmissionTrack.submission_id)
            .where(SubmissionTrack.track_id == track_id, MusicSubmission.status == "analyzing")
        ).all()
    for submission_id in submission_ids:
        maybe_finalize(submission_id)


def maybe_finalize(submission_id: uuid.UUID) -> None:
    """Enqueue profile building once no track in the submission is still pending."""
    with session_scope() as s:
        status = s.scalar(select(MusicSubmission.status).where(MusicSubmission.id == submission_id))
        if status != "analyzing":
            return
        remaining = s.scalar(
            select(func.count()).where(
                SubmissionTrack.submission_id == submission_id, SubmissionTrack.status.in_(PENDING)
            )
        )
        if remaining == 0:
            enqueue(
                s,
                KIND_BUILD,
                {"submission_id": str(submission_id)},
                dedupe_key=f"build:{submission_id}",
                priority=20,
            )


# --- build profile ----------------------------------------------------------------------


def load_library(s: Session, user_id: uuid.UUID) -> list[CurationTrack]:
    """All successfully analysed tracks across the user's submissions, oldest first."""
    rows = s.execute(
        select(Track.id, Track.duration_s, TrackAnalysis.features)
        .join(SubmissionTrack, SubmissionTrack.track_id == Track.id)
        .join(MusicSubmission, MusicSubmission.id == SubmissionTrack.submission_id)
        .join(
            TrackAnalysis,
            (TrackAnalysis.track_id == Track.id)
            & (TrackAnalysis.analyzer_version == ANALYZER_VERSION)
            & (TrackAnalysis.status == "succeeded"),
        )
        .where(MusicSubmission.user_id == user_id, SubmissionTrack.status == "done")
        .order_by(MusicSubmission.created_at, SubmissionTrack.position)
    ).all()
    seen: set[uuid.UUID] = set()
    library = []
    for track_id, duration, features in rows:
        if track_id in seen or features is None:
            continue
        seen.add(track_id)
        library.append(
            CurationTrack(str(track_id), TrackFeatures.model_validate(features), duration)
        )
    return library


def rebuild_music_profile(s: Session, user_id: uuid.UUID) -> MusicProfile | None:
    """Re-aggregate a user's stored analyses with the current code (no downloads).

    Used when the aggregation model changes. Creates a new immutable row that points at
    the same submission as the latest one; older rows are kept.
    """
    latest = s.scalar(
        select(MusicProfile)
        .where(MusicProfile.user_id == user_id)
        .order_by(MusicProfile.created_at.desc())
        .limit(1)
    )
    library = load_library(s, user_id)
    if latest is None or not library:
        return None
    data = aggregate_profile(library)
    profile = MusicProfile(
        user_id=user_id,
        submission_id=latest.submission_id,
        version=MUSIC_PROFILE_VERSION,
        analyzer_version=ANALYZER_VERSION,
        calibration=data.calibration,
        track_count=len(library),
        profile=data.model_dump(mode="json"),
    )
    s.add(profile)
    s.flush()
    return profile


@job_handler(KIND_BUILD, on_exhausted=_fail_submission)
def build_profile(payload: dict[str, Any], ctx: JobContext) -> None:
    from auralis.sound_profile.service import rebuild_sound_profile

    submission_id = uuid.UUID(payload["submission_id"])
    with session_scope() as s:
        sub = s.get(MusicSubmission, submission_id, with_for_update=True)
        if sub is None or sub.status not in ("analyzing", "aggregating"):
            return
        sub.status = "aggregating"
        user_id = sub.user_id

    with session_scope() as s:
        library = load_library(s, user_id)
    if not library:
        _fail_submission(
            payload, "None of the tracks could be analysed.", code="no_analysable_tracks"
        )
        return
    data = aggregate_profile(library)

    with session_scope() as s:
        profile = MusicProfile(
            user_id=user_id,
            submission_id=submission_id,
            version=MUSIC_PROFILE_VERSION,
            analyzer_version=ANALYZER_VERSION,
            calibration=data.calibration,
            track_count=len(library),
            profile=data.model_dump(mode="json"),
        )
        s.add(profile)
        s.flush()
        sub = s.get(MusicSubmission, submission_id)
        assert sub is not None
        sub.music_profile_id = profile.id
        sub.status = "completed"
        sub.completed_at = utcnow()
        rebuild_sound_profile(s, user_id)
