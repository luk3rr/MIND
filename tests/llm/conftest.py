# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db import migrate
from mind.db.base import make_session_factory
from mind.secrets import SecretStore


@pytest.fixture
def app_sessions(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    engine = migrate.upgrade("app", tmp_path / "app.db")
    yield make_session_factory(engine)
    engine.dispose()


@pytest.fixture
def secrets(tmp_path: Path) -> SecretStore:
    return SecretStore(tmp_path, env={})
