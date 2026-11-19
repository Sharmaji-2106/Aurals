"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from auralis.auth.models import User
from auralis.auth.service import user_for_token
from auralis.config import get_settings
from auralis.core.errors import Unauthorized
from auralis.db import get_db

DbSession = Annotated[Session, Depends(get_db)]


def optional_user(request: Request, db: DbSession) -> User | None:
    token = request.cookies.get(get_settings().session_cookie_name)
    return user_for_token(db, token) if token else None


OptionalUser = Annotated[User | None, Depends(optional_user)]


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise Unauthorized("Start a profile first.", code="no_session")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(get_settings().session_cookie_name, path="/")
