"""Shared fixtures.

Database tests run against ``AURALIS_TEST_DATABASE_URL`` (default: the local
``auralis_test`` database). The schema is rebuilt with Alembic once per session, so
migrations are exercised too; tables are truncated between tests.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

TEST_DB_URL = os.environ.get(
    "AURALIS_TEST_DATABASE_URL",
    "postgresql+psycopg://auralis:auralis@localhost:5432/auralis_test",
)
# Must happen before anything imports auralis.config.
os.environ["AURALIS_DATABASE_URL"] = TEST_DB_URL
os.environ["AURALIS_ENV"] = "test"


def _database_available() -> bool:
    from sqlalchemy import create_engine, text

    try:
        engine = create_engine(TEST_DB_URL)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
    except Exception:
        return False
    return True


@pytest.fixture(scope="session")
def migrated_db() -> None:
    if not _database_available():
        pytest.skip("test database unavailable (set AURALIS_TEST_DATABASE_URL)")
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine, text

    engine = create_engine(TEST_DB_URL)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    engine.dispose()
    config = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    config.cmd_opts = type("Opts", (), {"x": [f"url={TEST_DB_URL}"]})()  # type: ignore[assignment]
    command.upgrade(config, "head")


@pytest.fixture
def db(migrated_db: None) -> Iterator[None]:
    from sqlalchemy import text

    import auralis.models
    from auralis.db import get_engine

    yield
    tables = ", ".join(t.name for t in auralis.models.Base.metadata.sorted_tables)
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def client(db: None):  # type: ignore[no-untyped-def]
    from fastapi.testclient import TestClient

    from auralis.main import create_app

    with TestClient(create_app(), headers={"x-auralis-client": "web"}) as c:
        yield c


@pytest.fixture
def make_client(db: None):  # type: ignore[no-untyped-def]
    """Factory for independent browser sessions."""
    from fastapi.testclient import TestClient

    from auralis.main import create_app

    app = create_app()
    clients = []

    def factory(name: str = "Listener") -> TestClient:
        c = TestClient(app, headers={"x-auralis-client": "web"})
        clients.append(c)
        assert c.post("/api/session", json={"display_name": name}).status_code == 201
        return c

    yield factory
    for c in clients:
        c.close()
