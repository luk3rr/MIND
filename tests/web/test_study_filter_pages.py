# Filename: test_study_filter_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.helpers import wait_for
from tests.web.test_generate_pages import prepare
from tests.web.test_study_pages import current_item, front_of

HTMX = {"hx-request": "true"}


def finished_runs(client: TestClient, workspace_id: int) -> int:
    return int(client.get(f"/w/{workspace_id}/generate/runs").text.count("Concluída"))


def two_decks(client: TestClient) -> int:
    """Five approved Q&A cards (run 1) and five approved cloze cards (run 2)."""
    workspace_id = prepare(client)
    for run, subtype in ((1, "qa"), (2, "cloze")):
        response = client.post(
            f"/w/{workspace_id}/generate",
            data={"material_id": "1", "subtype": subtype, "quantity": "5"},
        )
        assert response.status_code == 303
        wait_for(lambda: finished_runs(client, workspace_id) == run)  # noqa: B023
        client.post(f"/w/{workspace_id}/review/approve-all", data={"run": str(run)})
    return workspace_id


def rate_with_filter(
    client: TestClient, workspace_id: int, item_id: int, **filter_fields: str
) -> str:
    response = client.post(
        f"/w/{workspace_id}/study/rate",
        data={"item_id": str(item_id), "rating": "4", **filter_fields},
        headers=HTMX,
    )
    assert response.status_code == 200
    return str(response.text)


def test_the_selector_lists_every_option_with_its_count(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    page = ready.get(f"/w/{workspace_id}/study").text
    assert "O que estudar" in page
    assert "Flashcards (10)" in page
    assert re.search(r"<option value=\"question\"[^>]*disabled[^>]*>Questões \(0\)", page)
    assert "Biologia (10)" in page
    assert "aula (10)" in page
    assert "Pergunta e resposta (5)" in page
    assert "Lacuna (cloze) (5)" in page
    assert "Limpar seleção" not in page


def test_filtering_by_card_type_shows_only_that_type(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    unfiltered = ready.get(f"/w/{workspace_id}/study").text
    assert "[…]" not in unfiltered.split('class="study-front')[1].split("</div>")[0]

    cloze = ready.get(f"/w/{workspace_id}/study?subtype=cloze").text
    assert "[…]" in front_of(cloze)
    assert "5 restantes" in cloze
    assert "Limpar seleção" in cloze
    assert re.search(r'<option value="cloze" selected>', cloze)


def test_the_selection_is_kept_while_rating_and_undoing(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    page = ready.get(f"/w/{workspace_id}/study?subtype=cloze&topic=1&material=1").text
    assert 'name="subtype" value="cloze"' in page
    assert 'name="topic" value="1"' in page

    fragment = rate_with_filter(
        ready,
        workspace_id,
        current_item(page),
        subtype="cloze",
        topic="1",
        material="1",
    )
    assert "[…]" in front_of(fragment)
    assert "4 restantes" in fragment
    assert 'name="subtype" value="cloze"' in fragment

    undone = ready.post(
        f"/w/{workspace_id}/study/undo", data={"subtype": "cloze"}, headers=HTMX
    ).text
    assert current_item(undone) == current_item(page)


def test_finishing_a_selection_says_so_and_leaves_the_other_cards_alone(
    ready: TestClient,
) -> None:
    workspace_id = two_decks(ready)
    page = ready.get(f"/w/{workspace_id}/study?subtype=cloze").text
    fragment = page
    for _ in range(5):
        fragment = rate_with_filter(ready, workspace_id, current_item(fragment), subtype="cloze")
    assert "nesta seleção" in fragment
    other = ready.get(f"/w/{workspace_id}/study").text
    assert "Pergunta" in front_of(other)
    assert "5 restantes" in other  # the Q&A cards are still waiting


def test_rating_without_htmx_redirects_keeping_the_selection(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    page = ready.get(f"/w/{workspace_id}/study?subtype=cloze").text
    response = ready.post(
        f"/w/{workspace_id}/study/rate",
        data={"item_id": str(current_item(page)), "rating": "3", "subtype": "cloze"},
    )
    assert response.status_code == 303
    assert response.headers["location"] == f"/w/{workspace_id}/study?subtype=cloze"


def test_questions_and_unknown_selections_are_empty_not_errors(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    questions = ready.get(f"/w/{workspace_id}/study?kind=question")
    assert questions.status_code == 200
    assert "nesta seleção" in questions.text
    assert "Sessão concluída" in questions.text
    assert "Sessão concluída" in ready.get(f"/w/{workspace_id}/study?topic=999").text


def test_invalid_selector_values_are_ignored(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    page = ready.get(f"/w/{workspace_id}/study?subtype=essay&topic=abc&kind=weird").text
    assert "Sessão concluída" not in page
    assert "10 restantes" in page


def test_today_offers_a_shortcut_to_the_selector(ready: TestClient) -> None:
    workspace_id = two_decks(ready)
    today = ready.get(f"/w/{workspace_id}/today").text
    assert "Escolher o que estudar" in today
    assert f"/w/{workspace_id}/study#f-kind" in today
