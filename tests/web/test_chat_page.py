# Filename: test_chat_page.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mind.config import Settings
from mind.web.app import create_app
from tests.helpers import ARTICLE, SavedPageFetcher, TopicEmbedder, wait_for
from tests.web.test_generate_pages import prepare


def ask(client: TestClient, workspace_id: int, question: str) -> int:
    response = client.post(f"/w/{workspace_id}/chat", data={"question": question})
    return int(response.status_code)


def test_the_page_starts_empty_and_without_the_extra_explains_how_to_enable_embeddings(
    ready: TestClient,
) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/chat").text
    assert "Nenhuma pergunta ainda" in page
    assert "mind-study[embeddings]" in page
    assert "Ativar e vetorizar" not in page


def test_an_answer_shows_its_source_and_links_to_the_chunk(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    assert ask(ready, workspace_id, "O que a mitocôndria faz?") == 303
    page = ready.get(f"/w/{workspace_id}/chat").text
    assert "Resposta baseada no material." in page
    assert "Fontes (1)" in page
    link = f"/w/{workspace_id}/library/1?chunk="
    assert link in page
    preview = ready.get(f"{link}1#chunk-1").text
    assert 'id="chunk-1"' in preview
    assert "chunk-highlight" in preview


def test_a_question_without_support_shows_the_refusal_and_nothing_is_sent(
    ready: TestClient,
) -> None:
    workspace_id = prepare(ready)
    assert ask(ready, workspace_id, "Xilofone zeppelin?") == 303
    page = ready.get(f"/w/{workspace_id}/chat").text
    assert "Não encontrei suporte no material" in page
    assert "Fontes (" not in page


def test_an_empty_question_rerenders_the_page_with_an_alert(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    response = ready.post(f"/w/{workspace_id}/chat", data={"question": "   "})
    assert response.status_code == 422
    assert "Escreva uma pergunta." in response.text


def test_without_a_key_the_page_explains_what_is_missing(client: TestClient) -> None:
    workspace = client.post("/api/v1/workspaces", json={"name": "W"}).json()["id"]
    text = ("# Célula\n\n" + "A mitocôndria produz energia para a célula. " * 30).encode()
    base = f"/api/v1/workspaces/{workspace}"
    client.post(f"{base}/materials", files={"file": ("aula.md", text, "text/markdown")})
    wait_for(lambda: client.get(f"{base}/materials/1").json()["status"] == "indexed")

    response = client.post(f"/w/{workspace}/chat", data={"question": "mitocôndria energia"})
    assert response.status_code == 409
    assert "Configure a chave do OpenRouter" in response.text
    assert "mitocôndria energia" in response.text  # the question is kept in the form


def test_history_can_be_cleared(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    ask(ready, workspace_id, "O que a mitocôndria faz?")
    assert ready.post(f"/w/{workspace_id}/chat/clear").status_code == 303
    assert "Nenhuma pergunta ainda" in ready.get(f"/w/{workspace_id}/chat").text


@pytest.fixture
def with_embedder(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(
        Settings(data_dir=tmp_path),
        page_fetcher=SavedPageFetcher(ARTICLE),
        embedder=TopicEmbedder(),
    )
    with TestClient(app, base_url="http://127.0.0.1:8000", follow_redirects=False) as test_client:
        yield test_client


def test_embeddings_can_be_enabled_updated_and_disabled(with_embedder: TestClient) -> None:
    workspace_id = prepare(with_embedder)
    page = with_embedder.get(f"/w/{workspace_id}/chat").text
    assert "Desativada" in page
    assert "Ativar e vetorizar" in page

    enabled = with_embedder.post(f"/w/{workspace_id}/chat/embeddings/enable")
    assert enabled.status_code == 303

    def done() -> bool:
        text = with_embedder.get(f"/w/{workspace_id}/chat").text
        return "Ativada" in text and "Vetorizar trechos novos" in text

    wait_for(done)
    text = with_embedder.get(f"/w/{workspace_id}/chat").text
    match = re.search(r"Trechos vetorizados: (\d+) / (\d+)", text)
    assert match
    assert match.group(1) == match.group(2) != "0"

    with_embedder.post(f"/w/{workspace_id}/chat/embeddings/disable")
    assert "Desativada" in with_embedder.get(f"/w/{workspace_id}/chat").text
