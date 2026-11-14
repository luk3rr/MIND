# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db import migrate
from mind.db.base import make_session_factory


@pytest.fixture
def workspace_sessions(tmp_path: Path) -> Iterator[sessionmaker[Session]]:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    yield make_session_factory(engine)
    engine.dispose()
