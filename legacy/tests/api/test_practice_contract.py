# Filename: test_practice_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.api.test_generations_contract import prepare
from tests.helpers import wait_for


def questions_workspace(
    client: TestClient, subtype: str = "multiple_choice_4", quantity: int = 3
) -> str:
    base = prepare(client)
    response = client.post(
        f"{base}/generations",
        json={"material_id": 1, "kind": "question", "subtype": subtype, "quantity": quantity},
    )
    assert response.status_code == 202
    run = response.json()
    assert (run["kind"], run["subtype"]) == ("question", subtype)
    wait_for(lambda: client.get(f"{base}/generations/{run['id']}").json()["status"] == "done")
    ids = [i["id"] for i in client.get(f"{base}/items", params={"kind": "question"}).json()]
    client.post(f"{base}/items/review", json={"approve": ids})
    return base


def test_a_question_generation_produces_drafts_with_options_and_the_answer(
    ready: TestClient,
) -> None:
    base = prepare(ready)
    response = ready.post(
        f"{base}/generations",
        json={"material_id": 1, "kind": "question", "subtype": "multiple_choice_5", "quantity": 3},
    )
    run = response.json()
    wait_for(lambda: ready.get(f"{base}/generations/{run['id']}").json()["status"] == "done")
    done = ready.get(f"{base}/generations/{run['id']}").json()
    assert (done["generated"], done["discarded_unsupported"]) == (3, 0)

    items = ready.get(f"{base}/items", params={"kind": "question", "status": "draft"}).json()
    assert len(items) == 3
    first = items[0]
    assert (first["subtype"], first["answer"]) == ("multiple_choice", "A")
    assert [o["key"] for o in first["options"]] == ["A", "B", "C", "D", "E"]
    assert first["options"][0]["why"] == "Porque sim."
    assert first["back"] == "Está no texto."


def test_generation_requests_are_validated_per_kind(ready: TestClient) -> None:
    base = prepare(ready)
    too_many = ready.post(
        f"{base}/generations",
        json={"material_id": 1, "kind": "question", "subtype": "certo_errado", "quantity": 31},
    )
    assert (too_many.status_code, too_many.json()["errors"][0]["field"]) == (422, "quantity")
    wrong_profile = ready.post(
        f"{base}/generations", json={"material_id": 1, "kind": "question", "subtype": "qa"}
    )
    assert wrong_profile.json()["errors"][0]["field"] == "subtype"
    assert (
        ready.post(
            f"{base}/generations", json={"material_id": 1, "kind": "essay", "subtype": "qa"}
        ).status_code
        == 422
    )
    estimate = ready.post(
        f"{base}/generations/estimate",
        json={"material_id": 1, "kind": "question", "subtype": "certo_errado", "quantity": 10},
    )
    assert estimate.status_code == 200
    assert estimate.json()["estimated_usd"] is None


def test_the_practice_queue_hides_the_answer_and_the_reasons(ready: TestClient) -> None:
    base = questions_workspace(ready)
    queue = ready.get(f"{base}/practice/queue").json()
    assert len(queue) == 3
    first = queue[0]
    assert set(first) == {
        "id", "subtype", "statement", "options", "topic", "attempts", "last_correct"
    }  # fmt: skip
    assert set(first["options"][0]) == {"key", "text"}
    assert (first["attempts"], first["last_correct"]) == (0, None)
    assert len(ready.get(f"{base}/practice/queue", params={"limit": 2}).json()) == 2


def test_answering_returns_the_verdict_the_reasons_and_updates_the_summary(
    ready: TestClient,
) -> None:
    base = questions_workspace(ready)
    first, second, _ = (q["id"] for q in ready.get(f"{base}/practice/queue").json())

    right = ready.post(
        f"{base}/practice/answers", json={"item_id": first, "answer": "A", "duration_seconds": 9.5}
    ).json()
    assert (right["correct"], right["correct_key"], right["explanation"]) == (
        True,
        "A",
        "Está no texto.",
    )
    assert right["options"][1]["why"] == "Porque sim."
    wrong = ready.post(f"{base}/practice/answers", json={"item_id": second, "answer": "C"}).json()
    assert wrong["correct"] is False

    summary = ready.get(f"{base}/practice/summary").json()
    assert summary == {
        "unseen": 1,
        "retry": 1,
        "to_practice": 2,
        "answered_today": 2,
        "correct_today": 1,
    }
    queue = ready.get(f"{base}/practice/queue").json()
    assert [q["last_correct"] for q in queue] == [None, False]
    assert len(ready.get(f"{base}/practice/queue", params={"redo": "true"}).json()) == 3


def test_selection_filters_apply_and_errors_are_problem_json(ready: TestClient) -> None:
    base = questions_workspace(ready)
    assert ready.get(f"{base}/practice/queue", params={"subtype": "certo_errado"}).json() == []
    assert (
        len(ready.get(f"{base}/practice/queue", params={"subtype": "multiple_choice"}).json()) == 3
    )
    assert ready.get(f"{base}/practice/queue", params={"topic_id": 999}).json() == []
    assert ready.get(f"{base}/practice/queue", params={"subtype": "qa"}).status_code == 422

    bad = ready.post(f"{base}/practice/answers", json={"item_id": 1, "answer": "Z"})
    assert (bad.status_code, bad.json()["code"]) == (422, "VALIDATION_ERROR")
    missing = ready.post(f"{base}/practice/answers", json={"item_id": 999, "answer": "A"})
    assert (missing.status_code, missing.json()["code"]) == (404, "ITEM_NOT_FOUND")
    assert ready.get("/api/v1/workspaces/77/practice/summary").status_code == 404
