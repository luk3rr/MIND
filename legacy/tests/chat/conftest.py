# Filename: conftest.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.chat.service import ChatService
from mind.config import Settings
from mind.db.workspace_models import Chunk, Material
from mind.llm.fake import FakeProvider
from mind.retrieval.retriever import Bm25Retriever
from mind.services import Services
from mind.workspaces.registry import WorkspaceRegistry

MITOCHONDRIA = (
    "A mitocôndria é a organela responsável pela respiração celular e produz a maior parte "
    "da energia da célula."
)
NUCLEUS = "O núcleo guarda o material genético da célula e coordena a divisão celular."


@dataclass
class ChatRig:
    sessions: sessionmaker[Session]
    fake: FakeProvider
    services: Services
    chat: ChatService
    chunk_ids: list[int]


@pytest.fixture
def chat_rig(tmp_path: Path) -> Iterator[ChatRig]:
    config = Settings(data_dir=tmp_path)
    registry = WorkspaceRegistry(config)
    fake = FakeProvider(name="openrouter")
    services = Services.build(config, registry, client=httpx.AsyncClient(), inner_provider=fake)
    services.consent.give("openrouter")
    workspace = registry.open(registry.create("Biologia").id)
    with workspace.sessions() as session:
        material = Material(title="Aula", kind="pdf", filename="a.pdf", stored_path="a.pdf")
        material.chunks = [
            Chunk(ordinal=0, page=3, text=MITOCHONDRIA),
            Chunk(ordinal=1, page=4, text=NUCLEUS),
        ]
        session.add(material)
        session.commit()
        ids = [c.id for c in material.chunks]
    chat = ChatService(workspace.sessions, services, Bm25Retriever(workspace.sessions))
    yield ChatRig(workspace.sessions, fake, services, chat, ids)
    registry.close()
