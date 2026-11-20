"""Database engine, session factory and declarative base."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from functools import lru_cache

from sqlalchemy import DateTime, MetaData, create_engine, func
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from auralis.config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    # Fetch server-generated values (created_at, updated_at) with RETURNING on flush,
    # so objects stay usable after commit without a refresh round-trip.
    __mapper_args__ = {"eager_defaults": True}


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


@lru_cache
def get_engine() -> Engine:
    raw_url = get_settings().database_url.get_secret_value()
    if raw_url.startswith("postgres://"):
        raw_url = "postgresql+psycopg://" + raw_url[len("postgres://") :]
    elif raw_url.startswith("postgresql://"):
        raw_url = "postgresql+psycopg://" + raw_url[len("postgresql://") :]
    return create_engine(
        raw_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=10,
    )


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def new_session() -> Session:
    return _session_factory()()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for workers and scripts: commit on success, roll back on error."""
    session = new_session()
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    """FastAPI dependency. Routes commit explicitly; anything uncommitted is rolled back."""
    session = new_session()
    try:
        yield session
    finally:
        session.close()
