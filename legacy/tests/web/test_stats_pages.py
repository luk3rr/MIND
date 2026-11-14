# Filename: test_stats_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re

from fastapi.testclient import TestClient

from tests.web.test_practice_pages import HTMX, answer, approved_questions, item_id
from tests.web.test_study_pages import approved_workspace, current_item


def test_an_empty_workspace_shows_zeros_and_empty_charts(ready: TestClient) -> None:
    workspace_id = ready.post("/workspaces", data={"name": "W"}).headers["location"].split("/")[2]
    page = ready.get(f"/w/{workspace_id}/stats").text
    assert "Estatísticas" in page
    assert "Ainda não há revisões de cards maduros" in page
    assert "Ainda não há tópicos com itens aprovados" in page
    assert "0 / 40" in page
    assert page.count("<svg") >= 1
    assert 'role="img"' in page


def test_studying_and_answering_feeds_the_numbers_the_streak_and_the_topic_table(
    ready: TestClient,
) -> None:
    workspace_id = approved_questions(ready, "multiple_choice_4", 3)
    question = item_id(ready.get(f"/w/{workspace_id}/practice").text)
    answer(ready, workspace_id, question, "A")
    answer(ready, workspace_id, question, "C")

    page = ready.get(f"/w/{workspace_id}/stats").text
    assert re.search(r'stat-number">1</div><div class="muted">Dias seguidos', page)
    assert "Biologia" in page
    assert "50%" in page  # one right and one wrong
    assert "(amostra pequena)" in page
    assert "<rect" in page
    assert "<title>" in page


def test_the_daily_goal_and_the_new_card_limit_can_be_changed(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    response = ready.post(
        f"/w/{workspace_id}/stats/goal", data={"daily_goal": "12", "new_per_day": "3"}
    )
    assert response.status_code == 303
    page = ready.get(f"/w/{workspace_id}/stats").text
    assert "0 / 12" in page
    assert 'name="new_per_day" type="number" min="0" max="500" value="3"' in page
    assert "0 / 12" in ready.get(f"/w/{workspace_id}/today").text
    study = ready.get(f"/w/{workspace_id}/study").text
    assert "3 restantes" in study


def test_an_invalid_goal_rerenders_the_page_with_an_alert(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    response = ready.post(
        f"/w/{workspace_id}/stats/goal", data={"daily_goal": "0", "new_per_day": "20"}
    )
    assert response.status_code == 422
    assert 'role="alert"' in response.text
    assert "0 / 40" in ready.get(f"/w/{workspace_id}/stats").text


def test_topics_can_be_renamed_merged_and_deleted(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    ready.post(
        f"/w/{workspace_id}/review/items/1",
        data={"front": "Pergunta?", "back": "R", "topic": "Energia"},
        headers=HTMX,
    )
    page = ready.get(f"/w/{workspace_id}/stats").text
    assert "Biologia" in page
    assert "Energia" in page
    ids = dict(
        re.findall(
            r'id="topic-name-(\d+)" name="name" type="text" maxlength="80" value="([^"]+)"', page
        )
    )
    by_name = {name: int(i) for i, name in ids.items()}

    renamed = ready.post(
        f"/w/{workspace_id}/stats/topics/{by_name['Energia']}/rename", data={"name": "Metabolismo"}
    )
    assert renamed.status_code == 303
    assert "Metabolismo" in ready.get(f"/w/{workspace_id}/stats").text

    clash = ready.post(
        f"/w/{workspace_id}/stats/topics/{by_name['Energia']}/rename", data={"name": "biologia"}
    )
    assert clash.status_code == 422

    merged = ready.post(
        f"/w/{workspace_id}/stats/topics/{by_name['Energia']}/merge",
        data={"target": str(by_name["Biologia"])},
    )
    assert merged.status_code == 303
    after = ready.get(f"/w/{workspace_id}/stats").text
    assert "Metabolismo" not in after
    assert "Energia" not in after

    deleted = ready.post(f"/w/{workspace_id}/stats/topics/{by_name['Biologia']}/delete")
    assert deleted.status_code == 303
    assert "Ainda não há tópicos com itens aprovados" in ready.get(f"/w/{workspace_id}/stats").text
    assert ready.post(f"/w/{workspace_id}/stats/topics/999/delete").status_code == 404


def test_cards_rated_in_the_study_session_count_in_the_stats(ready: TestClient) -> None:
    workspace_id = approved_workspace(ready)
    page = ready.get(f"/w/{workspace_id}/study").text
    for rating in ("3", "1"):
        ready.post(
            f"/w/{workspace_id}/study/rate",
            data={"item_id": str(current_item(page)), "rating": rating},
            headers=HTMX,
        )
    stats = ready.get(f"/w/{workspace_id}/stats").text
    assert "Biologia" in stats
    assert re.search(r"2</td>\s*</tr>", stats)  # two answers on the topic
    assert "2 / 40" in stats
