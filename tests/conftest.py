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
from mind.generation.schemas import CardBatch, JudgeBatch, QuestionBatch
from mind.llm.fake import FakeProvider
from mind.web.app import create_app
from tests.generation.fakes import (
    cards_from_prompt,
    judge_supports_everything,
    questions_from_prompt,
)


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


@pytest.fixture
def ready(tmp_path: Path) -> Iterator[TestClient]:
    """An app whose model is a scripted fake that needs no key or consent."""
    fake = FakeProvider(name="openrouter", requires_consent=False)
    fake.script(CardBatch, cards_from_prompt)
    fake.script(QuestionBatch, questions_from_prompt)
    fake.script(JudgeBatch, judge_supports_everything)
    app = create_app(Settings(data_dir=tmp_path), inner_provider=fake)
    with TestClient(app, base_url="http://127.0.0.1:8000", follow_redirects=False) as test_client:
        yield test_client
