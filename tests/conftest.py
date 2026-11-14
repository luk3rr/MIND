# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from mind.config import Settings
from mind.db import migrate
from mind.db.base import make_session_factory
from mind.web.app import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(Settings(data_dir=tmp_path))
    with TestClient(app, base_url="http://127.0.0.1:8000", follow_redirects=False) as test_client:
        yield test_client


@pytest.fixture
def workspace_sessions(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    yield make_session_factory(engine)
    engine.dispose()
