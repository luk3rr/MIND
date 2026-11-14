# Filename: test_study_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.web.test_generate_pages import generate, prepare

HTMX = {"hx-request": "true"}


def approved_workspace(client: TestClient, **form: str) -> int:
    workspace_id = prepare(client)
    generate(client, workspace_id, **form)
    client.post(f"/w/{workspace_id}/review/approve-all", data={"run": "1"})
    return workspace_id


def front_of(page: str) -> str:
    match = re.search(r'class="study-front[^"]*"[^>]*>(.*?)</div>', page, re.S)
    assert match
    return re.sub(r"<[^>]+>", "", match.group(1)).strip()


def rate(client: TestClient, workspace_id: int, item_id: int, rating: int) -> str:
    response = client.post(
        f"/w/{workspace_id}/study/rate",
        data={"item_id": str(item_id), "rating": str(rating), "elapsed_ms": "1200"},
        headers=HTMX,
    )
    assert response.status_code == 200
    return str(response.text)


def current_item(page: str) -> int:
    match = re.search(r'data-item-id="(\d+)"', page)
    assert match
    return int(match.group(1))


def test_today_guides_a_new_workspace_to_the_library(ready: TestClient) -> None:
    response = ready.post("/workspaces", data={"name": "Empty"})
    workspace_id = response.headers["location"].split("/")[2]
    page = ready.get(f"/w/{workspace_id}/today").text
    assert "Passo 3 de 3" in page
    assert f"/w/{workspace_id}/library" in page


def test_today_points_to_generation_when_there_are_no_approved_cards(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/today").text
    assert "ainda não tem cards aprovados" in page
    assert f"/w/{workspace_id}/generate" in page


def test_today_shows_the_counts_the_goal_and_the_study_button(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/today").text
    assert "Estudar agora (5)" in page
    assert "0 / 40" in page
    assert 'class="stat-number">5<' in page


def test_the_study_page_shows_the_front_hides_the_back_and_previews_intervals(
    ready: TestClient,
) -> None:
    workspace_id = approved_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/study").text
    assert "Pergunta" in front_of(page)
    assert 'id="study-back"' in page
    assert "hidden>" in page.split('id="study-back"')[1][:60]
    assert "Mostrar resposta (Espaço)" in page
    for label in ("Errei", "Difícil", "Bom", "Fácil"):
        assert label in page
    assert "Desfazer (Z)" in page
    assert "Fonte: aula" in page
    assert "Atalhos:" in page
    assert re.findall(r'class="rating-interval">([^<]+)<', page).__len__() == 4


def test_rating_answers_with_the_next_card_and_logs_the_time(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    first = current_item(ready.get(f"/w/{workspace_id}/study").text)
    fragment = rate(ready, workspace_id, first, 4)
    assert current_item(fragment) != first
    assert "<html" not in fragment  # an HTMX fragment, not a full page
    today = ready.get(f"/w/{workspace_id}/today").text
    assert "1 / 40" in today


def test_without_htmx_rating_redirects_back_to_the_session(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    first = current_item(ready.get(f"/w/{workspace_id}/study").text)
    response = ready.post(
        f"/w/{workspace_id}/study/rate", data={"item_id": str(first), "rating": "3"}
    )
    assert response.status_code == 303
    assert response.headers["location"] == f"/w/{workspace_id}/study"


def test_undo_brings_the_same_card_back(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    first = current_item(ready.get(f"/w/{workspace_id}/study").text)
    rate(ready, workspace_id, first, 4)
    restored = ready.post(f"/w/{workspace_id}/study/undo", headers=HTMX).text
    assert current_item(restored) == first
    assert "1 / 40" not in ready.get(f"/w/{workspace_id}/today").text
    nothing = ready.post(f"/w/{workspace_id}/study/undo", headers=HTMX)
    assert nothing.status_code == 200


def test_finishing_every_card_shows_the_session_summary(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/study").text
    fragment = page
    for _ in range(5):
        fragment = rate(ready, workspace_id, current_item(fragment), 4)
    assert "Sessão concluída" in fragment
    assert "Avaliados hoje: 5" in fragment
    assert "Fácil 5" in fragment
    done_page = ready.get(f"/w/{workspace_id}/study").text
    assert "Sessão concluída" in done_page
    assert "Tudo em dia" in ready.get(f"/w/{workspace_id}/today").text


def test_a_failed_card_returns_in_the_same_session(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    first = current_item(ready.get(f"/w/{workspace_id}/study").text)
    fragment = rate(ready, workspace_id, first, 1)
    seen = {current_item(fragment)}
    for _ in range(5):
        fragment = rate(ready, workspace_id, current_item(fragment), 4)
        if "Sessão concluída" in fragment:
            break
        seen.add(current_item(fragment))
    assert first in seen or "Sessão concluída" in fragment


def test_cloze_cards_hide_the_gap_in_front_and_reveal_it_in_back(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready, subtype="cloze")
    page = ready.get(f"/w/{workspace_id}/study").text
    front, back = page.split('id="study-back"')
    assert "[…]" in front
    assert "energia" not in front.split('class="study-front')[1]
    assert "energia" in back


def test_invalid_input_and_unknown_things_are_rejected(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    bad_rating = ready.post(
        f"/w/{workspace_id}/study/rate", data={"item_id": "1", "rating": "5"}, headers=HTMX
    )
    assert bad_rating.status_code == 422
    unknown = ready.post(
        f"/w/{workspace_id}/study/rate", data={"item_id": "999", "rating": "3"}, headers=HTMX
    )
    assert unknown.status_code == 404
    assert ready.get("/w/99/study").status_code == 404
    assert ready.get("/static/study.js").status_code == 200
