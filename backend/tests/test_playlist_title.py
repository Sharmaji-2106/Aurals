"""The music profile names a playlist only when the music came from one playlist alone."""

from __future__ import annotations

import pytest

from auralis.auth.models import User
from auralis.db import session_scope
from auralis.music.models import MusicSubmission, SubmissionSource
from auralis.music.service import _playlist_title


def _submission(*sources: tuple[str, str | None]) -> str:
    with session_scope() as db:
        user = User()
        db.add(user)
        db.flush()
        sub = MusicSubmission(user_id=user.id)
        db.add(sub)
        db.flush()
        for i, (kind, title) in enumerate(sources):
            db.add(
                SubmissionSource(
                    submission_id=sub.id, position=i, kind=kind, external_id=f"x{i}", title=title
                )
            )
        return str(sub.id)


@pytest.mark.usefixtures("db")
@pytest.mark.parametrize(
    ("sources", "expected"),
    [
        ((("playlist", "Neon Odyssey"),), "Neon Odyssey"),
        ((("spotify_playlist", "  Late Drives "),), "Late Drives"),
        # One song is a song's title, not a name for someone's music.
        ((("video", "Despacito"),), None),
        # Two playlists have no single name.
        ((("playlist", "A"), ("playlist", "B")), None),
        ((("playlist", None),), None),
        ((("playlist", "   "),), None),
    ],
)
def test_playlist_title(sources: tuple[tuple[str, str | None], ...], expected: str | None) -> None:
    import uuid

    sid = uuid.UUID(_submission(*sources))
    with session_scope() as db:
        assert _playlist_title(db, sid) == expected
    with session_scope() as db:
        assert _playlist_title(db, None) is None
