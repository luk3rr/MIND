# Filename: test_stats_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.api.test_practice_contract import questions_workspace


def wrong_then_card(client: TestClient) -> tuple[str, int, int]:
    base = questions_workspace(client)
    question = client.get(f"{base}/practice/queue").json()[0]["id"]
    client.post(f"{base}/practice/answers", json={"item_id": question, "answer": "C"})
    made = client.post(f"{base}/items/{question}/error-card")
    assert made.status_code == 200
    return base, question, made.json()["item_id"]


def test_the_error_card_is_created_once_and_listed(ready: TestClient) -> None:
    base, question, card = wrong_then_card(ready)
    again = ready.post(f"{base}/items/{question}/error-card").json()
    assert again == {"item_id": card, "created": False}

    notebook = ready.get(f"{base}/errors").json()
    assert notebook["counts"] == {"total": 1, "from_questions": 1, "failed_cards": 0}
    entry = notebook["entries"][0]
    assert (entry["item_id"], entry["from_question"], entry["source_title"]) == (card, True, "aula")
    created = ready.get(f"{base}/items/{card}").json()
    assert (created["kind"], created["status"], created["subtype"]) == ("card", "approved", "qa")
    assert "A) Alternativa 0" in created["front"]
    assert ready.get(f"{base}/errors", params={"topic_id": 999}).json()["entries"] == []


def test_only_missed_questions_can_become_cards_over_the_api(ready: TestClient) -> None:
    base = questions_workspace(ready)
    question = ready.get(f"{base}/practice/queue").json()[0]["id"]
    never = ready.post(f"{base}/items/{question}/error-card")
    assert (never.status_code, never.json()["code"]) == (422, "VALIDATION_ERROR")
    missing = ready.post(f"{base}/items/999/error-card")
    assert (missing.status_code, missing.json()["code"]) == (404, "ITEM_NOT_FOUND")
    assert ready.get("/api/v1/workspaces/77/errors").status_code == 404


def test_stats_summary_topics_activity_and_retention(ready: TestClient) -> None:
    base = questions_workspace(ready)
    ids = [q["id"] for q in ready.get(f"{base}/practice/queue").json()]
    ready.post(f"{base}/practice/answers", json={"item_id": ids[0], "answer": "A"})
    ready.post(f"{base}/practice/answers", json={"item_id": ids[1], "answer": "C"})

    summary = ready.get(f"{base}/stats/summary").json()
    assert (summary["answered_today"], summary["goal"], summary["goal_met"]) == (2, 40, False)
    assert (summary["current_streak"], summary["longest_streak"]) == (1, 1)

    [topic] = ready.get(f"{base}/stats/topics").json()
    assert (topic["name"], topic["question_attempts"], topic["question_correct"]) == (
        "Biologia",
        2,
        1,
    )
    assert (topic["accuracy"], topic["small_sample"]) == (0.5, True)

    activity = ready.get(f"{base}/stats/activity", params={"days": 7}).json()
    assert len(activity) == 7
    assert activity[-1]["attempts"] == 2
    retention = ready.get(f"{base}/stats/retention").json()
    assert (len(retention["days"]), retention["reviews"], retention["rate"]) == (30, 0, None)
    assert ready.get(f"{base}/stats/activity", params={"days": 0}).status_code == 422
    assert ready.get(f"{base}/stats/retention", params={"days": 366}).status_code == 422


def test_topics_can_be_listed_renamed_merged_and_deleted(ready: TestClient) -> None:
    base = questions_workspace(ready)
    item = ready.get(f"{base}/items", params={"kind": "question"}).json()[0]["id"]
    ready.patch(
        f"{base}/items/{item}",
        json={"front": "Enunciado?", "back": "Comentário.", "topic": "Energia"},
    )

    topics = {t["name"]: t for t in ready.get(f"{base}/topics").json()}
    assert set(topics) == {"Biologia", "Energia"}
    assert (topics["Biologia"]["questions"], topics["Energia"]["questions"]) == (2, 1)

    renamed = ready.patch(
        f"{base}/topics/{topics['Energia']['id']}", json={"name": " Metabolismo "}
    )
    assert renamed.json()["name"] == "Metabolismo"
    clash = ready.patch(f"{base}/topics/{topics['Energia']['id']}", json={"name": "biologia"})
    assert (clash.status_code, clash.json()["errors"][0]["field"]) == (422, "name")

    merged = ready.post(
        f"{base}/topics/{topics['Energia']['id']}/merge",
        json={"target_id": topics["Biologia"]["id"]},
    )
    assert (merged.json()["name"], merged.json()["questions"]) == ("Biologia", 3)
    assert [t["name"] for t in ready.get(f"{base}/topics").json()] == ["Biologia"]
    same = ready.post(
        f"{base}/topics/{topics['Biologia']['id']}/merge",
        json={"target_id": topics["Biologia"]["id"]},
    )
    assert same.status_code == 422

    assert ready.delete(f"{base}/topics/{topics['Biologia']['id']}").status_code == 204
    gone = ready.delete(f"{base}/topics/{topics['Biologia']['id']}")
    assert (gone.status_code, gone.json()["code"]) == (404, "TOPIC_NOT_FOUND")
