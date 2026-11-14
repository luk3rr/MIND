# Filename: test_study_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.api.test_generations_contract import prepare, run_generation


def studied_workspace(client: TestClient, **body: object) -> str:
    base = prepare(client)
    run_generation(client, base, **body)
    ids = [i["id"] for i in client.get(f"{base}/items").json()]
    client.post(f"{base}/items/review", json={"approve": ids})
    return base


def test_the_queue_lists_new_cards_with_sides_and_interval_labels(ready: TestClient) -> None:
    base = studied_workspace(ready)
    cards = ready.get(f"{base}/study/queue").json()
    assert len(cards) == 5
    first = cards[0]
    assert first["is_new"] is True
    assert (first["state"], first["due"]) == (None, None)
    assert first["front_display"] == first["item"]["front"]
    assert set(first["intervals"]) == {"1", "2", "3", "4"}
    assert len(ready.get(f"{base}/study/queue", params={"limit": 2}).json()) == 2
    assert ready.get(f"{base}/study/queue", params={"limit": 101}).status_code == 422


def test_cloze_cards_hide_the_gap_in_the_front_display(ready: TestClient) -> None:
    base = studied_workspace(ready, subtype="cloze")
    first = ready.get(f"{base}/study/queue").json()[0]
    assert "[…]" in first["front_display"]
    assert "[…]" not in first["back_display"]
    assert "energia" in first["back_display"]


def test_rating_moves_the_card_and_the_summary(ready: TestClient) -> None:
    base = studied_workspace(ready)
    item_id = ready.get(f"{base}/study/queue").json()[0]["item"]["id"]
    result = ready.post(
        f"{base}/study/reviews", json={"item_id": item_id, "rating": 4, "duration_ms": 900}
    ).json()
    assert (result["item_id"], result["state"], result["reps"], result["lapses"]) == (
        item_id,
        2,
        1,
        0,
    )
    summary = ready.get(f"{base}/study/summary").json()
    assert (summary["reviewed_today"], summary["new_studied_today"], summary["new_available"]) == (
        1,
        1,
        4,
    )
    assert (summary["daily_goal"], summary["new_per_day"], summary["to_study"]) == (40, 20, 4)
    remaining = [c["item"]["id"] for c in ready.get(f"{base}/study/queue").json()]
    assert item_id not in remaining


def test_undo_reverts_the_last_rating_and_reports_nothing_to_undo(ready: TestClient) -> None:
    base = studied_workspace(ready)
    item_id = ready.get(f"{base}/study/queue").json()[0]["item"]["id"]
    ready.post(f"{base}/study/reviews", json={"item_id": item_id, "rating": 3})
    assert ready.post(f"{base}/study/reviews/undo").json() == {"item_id": item_id}
    assert ready.get(f"{base}/study/summary").json()["reviewed_today"] == 0
    assert ready.post(f"{base}/study/reviews/undo").json() == {"item_id": None}


def test_settings_can_be_read_and_changed_with_validation(ready: TestClient) -> None:
    base = studied_workspace(ready)
    assert ready.get(f"{base}/study/settings").json() == {
        "new_per_day": 20,
        "daily_goal": 40,
        "desired_retention": 0.9,
    }
    changed = ready.patch(f"{base}/study/settings", json={"new_per_day": 2, "daily_goal": 5})
    assert (changed.json()["new_per_day"], changed.json()["daily_goal"]) == (2, 5)
    assert len(ready.get(f"{base}/study/queue").json()) == 2

    invalid = ready.patch(f"{base}/study/settings", json={"desired_retention": 0.1})
    assert (invalid.status_code, invalid.json()["code"]) == (422, "VALIDATION_ERROR")
    assert invalid.json()["errors"][0]["field"] == "desired_retention"


def test_rating_errors_are_problem_json(ready: TestClient) -> None:
    base = studied_workspace(ready)
    out_of_range = ready.post(f"{base}/study/reviews", json={"item_id": 1, "rating": 5})
    assert out_of_range.status_code == 422
    missing = ready.post(f"{base}/study/reviews", json={"item_id": 999, "rating": 3})
    assert (missing.status_code, missing.json()["code"]) == (404, "ITEM_NOT_FOUND")
    assert ready.get("/api/v1/workspaces/77/study/summary").status_code == 404

    run_generation(ready, base, subtype="true_false")
    draft = ready.get(f"{base}/items", params={"status": "draft"}).json()
    assert draft
    not_approved = ready.post(
        f"{base}/study/reviews", json={"item_id": draft[0]["id"], "rating": 3}
    )
    assert not_approved.status_code == 422
