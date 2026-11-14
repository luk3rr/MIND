# Filename: test_train_shortcut.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.helpers import wait_for
from tests.web.test_practice_pages import answer, approved_questions, item_id


def weak_workspace(client: TestClient) -> int:
    """A workspace whose only topic has five wrong answers."""
    workspace_id = approved_questions(client, "multiple_choice_4", 3)
    question = item_id(client.get(f"/w/{workspace_id}/practice").text)
    for _ in range(5):
        answer(client, workspace_id, question, "C")
    return workspace_id


def test_weak_topics_are_listed_on_today_and_stats_with_a_train_link(ready: TestClient) -> None:
    workspace_id = weak_workspace(ready)
    link = f'href="/w/{workspace_id}/generate?topic=1"'
    for page in ("today", "stats"):
        text = ready.get(f"/w/{workspace_id}/{page}").text
        assert "Pontos fracos" in text
        assert link in text


def test_a_workspace_without_enough_answers_has_no_weak_topics_section(ready: TestClient) -> None:
    workspace_id = approved_questions(ready, "multiple_choice_4", 3)
    assert "Pontos fracos" not in ready.get(f"/w/{workspace_id}/today").text


def test_the_generate_page_opens_pre_filled_for_the_topic(ready: TestClient) -> None:
    workspace_id = weak_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/generate", params={"topic": "1", "subtype": "qa"}).text
    assert "Treino do tópico" in page
    assert "<strong>Biologia</strong>" in page
    assert 'name="topic_id" value="1"' in page
    assert 'name="material_id"' not in page


def test_an_unknown_topic_falls_back_to_the_material_form(ready: TestClient) -> None:
    workspace_id = weak_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/generate", params={"topic": "99"}).text
    assert "Treino do tópico" not in page
    assert 'name="material_id"' in page


def test_a_training_run_is_labelled_with_the_topic(ready: TestClient) -> None:
    workspace_id = weak_workspace(ready)
    response = ready.post(
        f"/w/{workspace_id}/generate",
        data={"topic_id": "1", "subtype": "qa", "quantity": "3"},
    )
    assert response.status_code == 303
    wait_for(lambda: "Treino: Biologia" in ready.get(f"/w/{workspace_id}/generate/runs").text)
