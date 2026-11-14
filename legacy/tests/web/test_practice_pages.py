# Filename: test_practice_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.helpers import wait_for
from tests.web.test_generate_pages import prepare

HTMX = {"hx-request": "true"}


def approved_questions(
    client: TestClient, profile: str = "multiple_choice_4", quantity: int = 3
) -> int:
    workspace_id = prepare(client)
    response = client.post(
        f"/w/{workspace_id}/generate",
        data={"material_id": "1", "subtype": profile, "quantity": str(quantity)},
    )
    assert response.status_code == 303
    wait_for(lambda: "Concluída" in client.get(f"/w/{workspace_id}/generate/runs").text)
    client.post(f"/w/{workspace_id}/review/approve-all", data={"run": "1"})
    return workspace_id


def item_id(page: str) -> int:
    match = re.search(r'data-item-id="(\d+)"', page)
    assert match
    return int(match.group(1))


def answer(client: TestClient, workspace_id: int, item: int, choice: str, **extra: str) -> str:
    response = client.post(
        f"/w/{workspace_id}/practice/answer",
        data={"item_id": str(item), "choice": choice, "seconds": "7.4", **extra},
        headers=HTMX,
    )
    assert response.status_code == 200
    return str(response.text)


def test_generate_offers_question_profiles_and_the_run_is_labelled(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/generate").text
    assert '<optgroup label="Questões">' in page
    for label in (
        "Certo ou Errado",
        "Múltipla escolha (4 alternativas)",
        "Múltipla escolha (5 alternativas)",
    ):
        assert label in page
    ready.post(
        f"/w/{workspace_id}/generate",
        data={"material_id": "1", "subtype": "multiple_choice_5", "quantity": "3"},
    )
    wait_for(lambda: "Concluída" in ready.get(f"/w/{workspace_id}/generate/runs").text)
    runs = ready.get(f"/w/{workspace_id}/generate/runs").text
    assert "Múltipla escolha (5 alternativas)" in runs
    assert "3 / 3" in runs


def test_question_limits_are_reported_on_the_form(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    response = ready.post(
        f"/w/{workspace_id}/generate",
        data={"material_id": "1", "subtype": "certo_errado", "quantity": "31"},
    )
    assert response.status_code == 422
    assert "1 a 30 questões" in response.text or 'role="alert"' in response.text


def test_the_review_page_shows_options_the_correct_one_and_the_comment(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    ready.post(
        f"/w/{workspace_id}/generate",
        data={"material_id": "1", "subtype": "multiple_choice_4", "quantity": "3"},
    )
    wait_for(lambda: "Concluída" in ready.get(f"/w/{workspace_id}/generate/runs").text)
    page = ready.get(f"/w/{workspace_id}/review?run=1").text
    assert page.count('class="card review-item"') == 3
    assert "Alternativa 0 da questão 0" in page
    assert "(correta)" in page
    assert "Porque sim." in page
    assert "Comentário:" in page
    assert "Está no texto." in page
    assert "<mark>" in page

    edit = ready.get(f"/w/{workspace_id}/review/items/1/edit").text
    assert "Enunciado" in edit
    assert "Comentário" in edit


def test_practice_shows_one_question_with_radio_options_and_no_answer_yet(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready)
    page = ready.get(f"/w/{workspace_id}/practice").text
    assert "Praticar questões" in page
    assert page.count('type="radio"') == 4
    assert "Alternativa 0 da questão 0" in page
    assert "Inédita" in page
    assert "3 restantes" in page
    assert "Atalhos:" in page
    assert "Gabarito" not in page
    assert ready.get("/static/practice.js").status_code == 200


def test_a_correct_answer_shows_the_key_the_reasons_and_the_source(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    first = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    feedback = answer(ready, workspace_id, first, "A")
    assert "Você acertou!" in feedback
    assert "Gabarito: <strong>A</strong>" in feedback
    assert "7 s" in feedback
    assert "Porque sim." in feedback
    assert "Está no texto." in feedback
    assert "Fonte: aula" in feedback
    assert "is-correct" in feedback
    assert f"after={first}" in feedback
    assert "Próxima (N)" in feedback


def test_a_wrong_answer_marks_the_chosen_option_and_the_question_comes_back_later(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready)
    first = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    feedback = answer(ready, workspace_id, first, "C")
    assert "Você errou." in feedback
    assert "is-chosen" in feedback

    seen = [first]
    page = ready.get(f"/w/{workspace_id}/practice/next?after={first}", headers=HTMX).text
    for _ in range(2):
        current = item_id(page)
        seen.append(current)
        answer(ready, workspace_id, current, "A")
        page = ready.get(f"/w/{workspace_id}/practice/next?after={current}", headers=HTMX).text
    assert len(set(seen)) == 3
    assert item_id(page) == first
    assert "Revisar erro" in page


def test_finishing_every_question_shows_the_summary_and_redo_brings_them_back(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready, "certo_errado", 2)
    page = ready.get(f"/w/{workspace_id}/practice").text
    for _ in range(2):
        current = item_id(page)
        answer(ready, workspace_id, current, "C")
        page = ready.get(f"/w/{workspace_id}/practice/next?after={current}", headers=HTMX).text
    assert "Prática concluída" in page
    assert "Respondidas hoje: 2" in page
    # one of the two had the wrong verdict, so it is still waiting; with redo both are back
    assert "restantes" in ready.get(f"/w/{workspace_id}/practice").text
    assert "Revisar erro" in ready.get(f"/w/{workspace_id}/practice").text
    redo = ready.get(f"/w/{workspace_id}/practice?redo=1").text
    assert 'name="redo" value="1" checked' in redo


def test_true_false_questions_offer_certo_and_errado(ready: TestClient) -> None:
    workspace_id = approved_questions(ready, "certo_errado", 2)
    page = ready.get(f"/w/{workspace_id}/practice").text
    assert page.count('type="radio"') == 2
    assert 'value="C"' in page
    assert 'value="E"' in page
    assert "Certo" in page
    assert "Errado" in page


def test_invalid_answers_and_missing_things_are_rejected(ready: TestClient) -> None:
    workspace_id = approved_questions(ready)
    first = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    bad = ready.post(
        f"/w/{workspace_id}/practice/answer",
        data={"item_id": str(first), "choice": "Z"},
        headers=HTMX,
    )
    assert bad.status_code == 422
    unknown = ready.post(
        f"/w/{workspace_id}/practice/answer", data={"item_id": "999", "choice": "A"}, headers=HTMX
    )
    assert unknown.status_code == 404
    redirected = ready.post(
        f"/w/{workspace_id}/practice/answer", data={"item_id": str(first), "choice": "A"}
    )
    assert redirected.status_code == 303
    assert ready.get("/w/99/practice").status_code == 404


def test_today_counts_the_questions_to_practice_and_the_selector_leads_there(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready)
    today = ready.get(f"/w/{workspace_id}/today").text
    assert "Questões para praticar: 3" in today
    assert f"/w/{workspace_id}/practice" in today
    selector = ready.get(f"/w/{workspace_id}/study").text
    assert re.search(r'<option value="question"(?! disabled)[^>]*>Questões \(3\)', selector)


def test_practice_without_questions_says_so(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/practice").text
    assert "Prática concluída" in page
