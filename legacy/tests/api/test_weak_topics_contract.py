# Filename: test_weak_topics_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.api.test_generations_contract import run_generation
from tests.api.test_practice_contract import questions_workspace


def test_weak_topics_need_enough_events_and_are_ordered_by_accuracy(ready: TestClient) -> None:
    base = questions_workspace(ready)
    assert ready.get(f"{base}/stats/weak-topics").json() == []

    question = ready.get(f"{base}/practice/queue").json()[0]["id"]
    for _ in range(5):
        ready.post(f"{base}/practice/answers", json={"item_id": question, "answer": "C"})
    [weak] = ready.get(f"{base}/stats/weak-topics").json()
    assert (weak["name"], weak["events"], weak["accuracy"]) == ("Biologia", 5, 0.0)
    assert ready.get(f"{base}/stats/weak-topics", params={"limit": 0}).status_code == 422
    assert ready.get("/api/v1/workspaces/77/stats/weak-topics").status_code == 404


def test_a_generation_can_train_on_a_topic_without_a_material(ready: TestClient) -> None:
    base = questions_workspace(ready)
    question = ready.get(f"{base}/practice/queue").json()[0]["id"]
    ready.post(f"{base}/practice/answers", json={"item_id": question, "answer": "C"})
    [topic] = ready.get(f"{base}/topics").json()
    topic_id = topic["id"]
    done = run_generation(ready, base, material_id=None, topic_id=topic_id, quantity=3)
    assert done["topic_id"] == topic_id


def test_a_generation_needs_a_material_or_a_topic(ready: TestClient) -> None:
    base = questions_workspace(ready)
    response = ready.post(f"{base}/generations", json={"subtype": "qa", "quantity": 3})
    assert (response.status_code, response.json()["code"]) == (422, "VALIDATION_ERROR")
