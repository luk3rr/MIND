# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mind.config import Settings
from mind.web.app import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(Settings(data_dir=tmp_path))
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client
