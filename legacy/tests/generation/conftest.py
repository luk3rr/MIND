# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db import migrate
from mind.db.base import make_session_factory
from mind.db.workspace_models import Chunk, GenerationRun, Material
from mind.generation.cards import CardGenerator
from mind.generation.planning import SourceChunk
from mind.llm.consent import ConsentService
from mind.llm.costs import CostLedger, PriceCatalog
from mind.llm.fake import FakeProvider
from mind.llm.guarded import GuardedProvider
from mind.secrets import SecretStore
from mind.settings_service import SettingsService

CHUNK_TEXT = (
    "A mitocôndria é a organela responsável pela respiração celular. "
    "O núcleo guarda o material genético da célula."
)


@dataclass
class Rig:
    workspace: sessionmaker[Session]
    app: sessionmaker[Session]
    fake: FakeProvider
    guarded: GuardedProvider
    generator: CardGenerator
    chunk: SourceChunk
    run_id: int


@pytest.fixture
def rig(tmp_path: Path) -> Iterator[Rig]:
    workspace_engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    app_engine = migrate.upgrade("app", tmp_path / "app.db")
    workspace = make_session_factory(workspace_engine)
    app = make_session_factory(app_engine)

    fake = FakeProvider(name="openrouter")
    consent = ConsentService(app)
    consent.give("openrouter")
    ledger = CostLedger(app, PriceCatalog(app))
    guarded = GuardedProvider(
        fake, consent, ledger, SettingsService(app, SecretStore(tmp_path, env={}))
    )

    with workspace() as session:
        material = Material(title="Aula", kind="pdf", filename="a.pdf", stored_path="a.pdf")
        material.chunks = [Chunk(ordinal=0, page=3, text=CHUNK_TEXT)]
        run = GenerationRun(kind="card", subtype="qa", model="vendor/m", requested=5)
        session.add_all([material, run])
        session.commit()
        chunk = SourceChunk(material.chunks[0].id, material.id, "Aula", 3, None, CHUNK_TEXT)
        run_id = run.id

    yield Rig(workspace, app, fake, guarded, CardGenerator(workspace, guarded), chunk, run_id)
    workspace_engine.dispose()
    app_engine.dispose()
