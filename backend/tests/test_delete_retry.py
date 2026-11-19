"""Deleting an account survives Postgres breaking a deadlock against it."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from psycopg import errors as pg_errors
from sqlalchemy.exc import OperationalError

from auralis.auth.models import User
from auralis.profiles import service


class _Session:
    """Stands in for a session whose first `fail` deletes lose a deadlock."""

    def __init__(self, fail: int, error: Exception | None = None) -> None:
        self.fail = fail
        self.error = error
        self.deletes = 0
        self.commits = 0
        self.rollbacks = 0

    def get(self, _model: Any, _id: Any) -> None:
        return None

    def execute(self, _statement: Any) -> None:
        self.deletes += 1
        if self.deletes <= self.fail:
            raise OperationalError(
                "DELETE FROM users", {}, self.error or pg_errors.DeadlockDetected()
            )

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


def _user() -> User:
    return User(id=uuid.uuid4())


def test_a_deadlock_is_retried_until_the_delete_lands() -> None:
    db = _Session(fail=2)
    service.delete_account_now(db, _user(), pause=0)  # type: ignore[arg-type]
    assert (db.deletes, db.rollbacks, db.commits) == (3, 2, 1)


def test_it_gives_up_after_the_last_attempt() -> None:
    db = _Session(fail=service.DELETE_ATTEMPTS)
    with pytest.raises(OperationalError):
        service.delete_account_now(db, _user(), pause=0)  # type: ignore[arg-type]
    assert db.commits == 0


def test_other_database_errors_are_not_retried() -> None:
    db = _Session(fail=1, error=pg_errors.QueryCanceled())
    with pytest.raises(OperationalError):
        service.delete_account_now(db, _user(), pause=0)  # type: ignore[arg-type]
    assert db.deletes == 1
