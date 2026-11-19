"""Anonymous-first sessions.

A new listener gets an account immediately (just a display name) and a random
256-bit bearer token in an HttpOnly cookie. Only its SHA-256 hash is stored, so a
database leak doesn't leak sessions. Email sign-in can later attach to the same user.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from auralis.auth.models import AuthSession, User
from auralis.config import get_settings
from auralis.core.time import utcnow

TOUCH_INTERVAL = timedelta(minutes=10)


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=utcnow() + timedelta(days=get_settings().session_ttl_days),
        )
    )
    return token


def user_for_token(db: Session, token: str) -> User | None:
    if not token or len(token) > 128:
        return None
    now = utcnow()
    row = db.execute(
        select(AuthSession, User)
        .join(User, User.id == AuthSession.user_id)
        .where(AuthSession.token_hash == hash_token(token), AuthSession.expires_at > now)
    ).one_or_none()
    if row is None:
        return None
    session: AuthSession = row[0]
    user: User = row[1]
    if now - session.last_used_at > TOUCH_INTERVAL:
        db.execute(update(AuthSession).where(AuthSession.id == session.id).values(last_used_at=now))
        db.execute(update(User).where(User.id == user.id).values(last_seen_at=now))
        db.commit()
    return user


def revoke_all(db: Session, user: User) -> None:
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
