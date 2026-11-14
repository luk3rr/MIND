# Filename: test_review_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.web.test_generate_pages import generate, prepare


def draft_ids(page: str) -> list[int]:
    return [int(n) for n in re.findall(r'id="item-(\d+)"', page)]


def start(ready: TestClient, **form: str) -> tuple[int, str]:
    workspace_id = prepare(ready)
    generate(ready, workspace_id, **form)
    return workspace_id, ready.get(f"/w/{workspace_id}/review?run=1").text


def test_review_lists_drafts_with_the_highlighted_source(ready: TestClient) -> None:
    _, page = start(ready)
    assert len(draft_ids(page)) == 5
    assert "<mark>" in page
    assert "A mitocôndria produz energia para a célula" in page
    assert "número 0?" in page
    assert "Aprovar selecionados" in page
    assert "5 pendentes" in page


def test_review_without_a_run_param_picks_the_run_with_drafts(ready: TestClient) -> None:
    workspace_id, _ = start(ready)
    page = ready.get(f"/w/{workspace_id}/review").text
    assert len(draft_ids(page)) == 5


def test_approving_the_selected_items_leaves_the_rest_pending(ready: TestClient) -> None:
    workspace_id, page = start(ready)
    ids = draft_ids(page)
    response = ready.post(
        f"/w/{workspace_id}/review/approve",
        data={"item_ids": [str(i) for i in ids[:3]], "run": "1"},
    )
    assert response.status_code == 303
    after = ready.get(f"/w/{workspace_id}/review?run=1").text
    assert draft_ids(after) == ids[3:]
    assert "2 pendentes" in after


def test_approve_all_and_discard_selected(ready: TestClient) -> None:
    workspace_id, page = start(ready)
    ids = draft_ids(page)
    ready.post(f"/w/{workspace_id}/review/discard", data={"item_ids": [str(ids[0])], "run": "1"})
    assert draft_ids(ready.get(f"/w/{workspace_id}/review?run=1").text) == ids[1:]
    assert ready.post(f"/w/{workspace_id}/review/approve-all", data={"run": "1"}).status_code == 303
    final = ready.get(f"/w/{workspace_id}/review?run=1").text
    assert draft_ids(final) == []
    assert "Não há cards para revisar" in final


def test_discarding_one_item_removes_its_card(ready: TestClient) -> None:
    workspace_id, page = start(ready)
    first = draft_ids(page)[0]
    response = ready.post(f"/w/{workspace_id}/review/items/{first}/discard")
    assert (response.status_code, response.text) == (200, "")
    assert first not in draft_ids(ready.get(f"/w/{workspace_id}/review?run=1").text)


def test_edit_form_saves_marks_the_card_and_validates(ready: TestClient) -> None:
    workspace_id, page = start(ready)
    first = draft_ids(page)[0]

    form = ready.get(f"/w/{workspace_id}/review/items/{first}/edit")
    assert form.status_code == 200
    assert "<textarea" in form.text

    saved = ready.post(
        f"/w/{workspace_id}/review/items/{first}",
        data={"front": "Pergunta melhorada?", "back": "Resposta melhor.", "topic": "Respiração"},
    )
    assert saved.status_code == 200
    assert "Pergunta melhorada?" in saved.text
    assert "editado" in saved.text
    assert "Respiração" in saved.text

    invalid = ready.post(
        f"/w/{workspace_id}/review/items/{first}", data={"front": " ", "back": "x", "topic": ""}
    )
    assert 'role="alert"' in invalid.text
    assert ready.get(f"/w/{workspace_id}/review/items/{first}").status_code == 200
    assert ready.get(f"/w/{workspace_id}/review/items/999").status_code == 404


def test_cloze_cards_show_their_gap_in_brackets(ready: TestClient) -> None:
    _, page = start(ready, subtype="cloze")
    assert "Sobre [energia] no trecho" in page
    assert "parte 0." in page


def test_review_without_any_run_is_an_empty_page(ready: TestClient) -> None:
    response = ready.post("/workspaces", data={"name": "Empty"})
    workspace_id = response.headers["location"].split("/")[2]
    page = ready.get(f"/w/{workspace_id}/review")
    assert page.status_code == 200
    assert "Não há cards para revisar" in page.text
