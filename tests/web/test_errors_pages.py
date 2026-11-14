# Filename: test_errors_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.web.test_practice_pages import HTMX, answer, approved_questions, item_id
from tests.web.test_study_pages import current_item


def make_card(client: TestClient, workspace_id: int, question: int) -> str:
    response = client.post(
        f"/w/{workspace_id}/practice/error-card", data={"item_id": str(question)}, headers=HTMX
    )
    assert response.status_code == 200
    return str(response.text)


def test_the_button_only_appears_after_a_wrong_answer(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    first, second = item_id(ready.get(f"/w/{workspace_id}/practice").text), 0
    right = answer(ready, workspace_id, first, "A")
    assert "Virar card" not in right
    page = ready.get(f"/w/{workspace_id}/practice/next?after={first}", headers=HTMX).text
    second = item_id(page)
    wrong = answer(ready, workspace_id, second, "C")
    assert "Virar card" in wrong
    assert f'"item_id": "{second}"' in wrong


def test_making_the_card_is_idempotent_and_the_button_turns_into_a_status(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready)
    question = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    answer(ready, workspace_id, question, "C")

    first = make_card(ready, workspace_id, question)
    assert "Card criado." in first
    again = make_card(ready, workspace_id, question)
    assert "Já está no baralho." in again

    reanswered = answer(ready, workspace_id, question, "C")
    assert "Já está no baralho." in reanswered
    assert "Virar card" not in reanswered


def test_only_missed_questions_can_become_cards(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    question = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    never_answered = ready.post(
        f"/w/{workspace_id}/practice/error-card", data={"item_id": str(question)}, headers=HTMX
    )
    assert never_answered.status_code == 422
    answer(ready, workspace_id, question, "A")  # correct
    still_not = ready.post(
        f"/w/{workspace_id}/practice/error-card", data={"item_id": str(question)}, headers=HTMX
    )
    assert still_not.status_code == 422
    unknown = ready.post(
        f"/w/{workspace_id}/practice/error-card", data={"item_id": "999"}, headers=HTMX
    )
    assert unknown.status_code == 404


def test_the_new_card_is_studied_and_listed_in_the_notebook(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    question = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    answer(ready, workspace_id, question, "C")
    make_card(ready, workspace_id, question)

    page = ready.get(f"/w/{workspace_id}/errors").text
    assert "Caderno de erros" in page
    assert "Questão errada" in page
    assert "Alternativa 0 da questão 0" not in page.split("<h1>")[0]
    assert 'class="stat-number">1<' in page
    assert "aula" in page

    study = ready.get(f"/w/{workspace_id}/study").text
    assert "Afirmação" in study or "Alternativa" in study  # the error card is a normal new card
    assert f"/w/{workspace_id}/errors" in ready.get(f"/w/{workspace_id}/today").text


def test_cards_rated_errei_are_listed_without_being_duplicated(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    for run_form in ({"material_id": "1", "subtype": "qa", "quantity": "2"},):
        ready.post(f"/w/{workspace_id}/generate", data=run_form)
    from tests.helpers import wait_for

    wait_for(lambda: ready.get(f"/w/{workspace_id}/generate/runs").text.count("Concluída") == 2)
    ready.post(f"/w/{workspace_id}/review/approve-all", data={"run": "2"})
    study = ready.get(f"/w/{workspace_id}/study").text
    ready.post(
        f"/w/{workspace_id}/study/rate",
        data={"item_id": str(current_item(study)), "rating": "1"},
        headers=HTMX,
    )

    page = ready.get(f"/w/{workspace_id}/errors").text
    assert "Card errado" in page
    assert "Questão errada" not in page
    assert 'class="stat-number">1<' in page


def test_the_notebook_filters_by_topic_and_has_an_empty_state(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    assert "Nenhum erro registrado ainda" in ready.get(f"/w/{workspace_id}/errors").text
    question = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    answer(ready, workspace_id, question, "C")
    make_card(ready, workspace_id, question)
    all_entries = ready.get(f"/w/{workspace_id}/errors").text
    assert "Biologia" in all_entries
    topic = re.search(r'<option value="(\d+)"', all_entries)
    assert topic
    assert "Questão errada" in ready.get(f"/w/{workspace_id}/errors?topic={topic.group(1)}").text
    assert "Nenhum erro registrado ainda" in ready.get(f"/w/{workspace_id}/errors?topic=999").text


def test_the_sidebar_links_to_the_notebook(ready: TestClient) -> None:
    workspace_id = ready.post("/workspaces", data={"name": "W"}).headers["location"].split("/")[2]
    assert f'href="/w/{workspace_id}/errors"' in ready.get(f"/w/{workspace_id}/today").text
