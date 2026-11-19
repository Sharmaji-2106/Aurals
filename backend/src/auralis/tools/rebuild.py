"""Rebuild derived profiles after a model change, from stored evidence only."""

from __future__ import annotations

from sqlalchemy import select, union

from auralis.db import session_scope
from auralis.music.models import MusicProfile
from auralis.music.pipeline import rebuild_music_profile
from auralis.questionnaire.models import QuestionnaireResponse
from auralis.sound_profile.service import rebuild_sound_profile


def rebuild_all() -> tuple[int, int]:
    """New music profiles for users with music, new sound profiles for everyone with evidence."""
    with session_scope() as s:
        users = s.scalars(
            union(select(MusicProfile.user_id), select(QuestionnaireResponse.user_id))
        ).all()
    music = sound = 0
    for user_id in users:
        with session_scope() as s:
            if rebuild_music_profile(s, user_id) is not None:
                music += 1
            rebuild_sound_profile(s, user_id)
            sound += 1
    return music, sound
