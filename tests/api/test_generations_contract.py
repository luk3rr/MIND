# Filename: test_generations_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.helpers import wait_for

TEXT = (
    "# Célula\n\n" + "A mitocôndria produz energia para a célula e participa da respiração. " * 30
)


def prepare(client: TestClient) -> str:
    workspace = client.post("/api/v1/workspaces", json={"name": "Study"}).json()
    base = f"/api/v1/workspaces/{workspace['id']}"
    client.post(f"{base}/materials", files={"file": ("aula.md", TEXT.encode(), "text/markdown")})
    wait_for(lambda: client.get(f"{base}/materials/1").json()["status"] == "indexed")
    return base


def run_generation(client: TestClient, base: str, **body: object) -> dict[str, object]:
    payload = {"material_id": 1, "subtype": "qa", "quantity": 5, **body}
    response = client.post(f"{base}/generations", json=payload)
    assert response.status_code == 202, response.text
    run: dict[str, object] = response.json()
    wait_for(lambda: client.get(f"{base}/generations/{run['id']}").json()["status"] == "done")
    return client.get(f"{base}/generations/{run['id']}").json()  # type: ignore[no-any-return]


def test_start_returns_202_and_the_run_finishes_with_drafts(ready: TestClient) -> None:
    base = prepare(ready)
    started = ready.post(
        f"{base}/generations", json={"material_id": 1, "subtype": "qa", "quantity": 5}
    )
    assert started.status_code == 202
    body = started.json()
    assert (body["status"], body["requested"], body["kind"]) == ("queued", 5, "card")
    assert ready.get(f"{base}/jobs/{body['job_id']}").status_code == 200

    wait_for(lambda: ready.get(f"{base}/generations/{body['id']}").json()["status"] == "done")
    done = ready.get(f"{base}/generations/{body['id']}").json()
    assert done["generated"] == 5
    assert done["finished_at"] is not None
    assert [r["id"] for r in ready.get(f"{base}/generations").json()] == [body["id"]]
    drafts = ready.get(f"{base}/items", params={"status": "draft", "run_id": body["id"]}).json()
    assert len(drafts) == 5
    assert drafts[0]["quote"].startswith("A mitocôndria produz energia")
    assert drafts[0]["source_title"] == "aula"


def test_estimate_does_not_start_anything(ready: TestClient) -> None:
    base = prepare(ready)
    estimate = ready.post(
        f"{base}/generations/estimate",
        json={"material_id": 1, "subtype": "qa", "quantity": 20},
    ).json()
    assert estimate["estimated_usd"] is None
    assert estimate["batches"] >= 1
    assert estimate["prompt_chars"] > 0
    assert ready.get(f"{base}/generations").json() == []


def test_request_errors_are_problem_json(ready: TestClient) -> None:
    base = prepare(ready)
    bad_quantity = ready.post(
        f"{base}/generations", json={"material_id": 1, "subtype": "qa", "quantity": 0}
    )
    assert (bad_quantity.status_code, bad_quantity.json()["code"]) == (422, "VALIDATION_ERROR")
    assert bad_quantity.json()["errors"][0]["field"] == "quantity"
    missing = ready.post(f"{base}/generations", json={"material_id": 9, "subtype": "qa"})
    assert (missing.status_code, missing.json()["code"]) == (404, "MATERIAL_NOT_FOUND")
    unknown_run = ready.get(f"{base}/generations/77")
    assert (unknown_run.status_code, unknown_run.json()["code"]) == (404, "RUN_NOT_FOUND")
    assert ready.get("/api/v1/workspaces/55/generations").status_code == 404


def test_generation_is_refused_without_key_or_consent(client: TestClient) -> None:
    base = prepare(client)
    response = client.post(f"{base}/generations", json={"material_id": 1, "subtype": "qa"})
    assert (response.status_code, response.json()["code"]) == (409, "PROVIDER_KEY_MISSING")
    assert client.get(f"{base}/generations").json() == []


def test_items_can_be_filtered_paginated_edited_and_reviewed(ready: TestClient) -> None:
    base = prepare(ready)
    run = run_generation(ready, base)
    items = ready.get(f"{base}/items", params={"run_id": run["id"]}).json()
    ids = [i["id"] for i in items]
    assert len(ids) == 5
    assert [
        i["id"] for i in ready.get(f"{base}/items", params={"limit": 2, "offset": 1}).json()
    ] == ids[1:3]
    assert ready.get(f"{base}/items/{ids[0]}").json()["front"].endswith("número 0?")

    edited = ready.patch(
        f"{base}/items/{ids[0]}",
        json={"front": "Pergunta melhor?", "back": "Resposta.", "topic": "Tema"},
    ).json()
    assert (edited["front"], edited["edited"], edited["topic"]) == (
        "Pergunta melhor?",
        True,
        "Tema",
    )

    result = ready.post(
        f"{base}/items/review", json={"approve": ids[:3], "discard": ids[3:]}
    ).json()
    assert result == {"approved": 3, "discarded": 2, "skipped": 0}
    after = ready.get(f"{base}/generations/{run['id']}").json()
    assert (after["approved"], after["approved_unedited"], after["discarded_review"]) == (3, 2, 2)
    assert len(ready.get(f"{base}/items", params={"status": "approved"}).json()) == 3
    assert ready.get(f"{base}/items", params={"status": "draft"}).json() == []


def test_item_errors_are_problem_json(ready: TestClient) -> None:
    base = prepare(ready)
    run_generation(ready, base, subtype="cloze")
    item = ready.get(f"{base}/items").json()[0]

    invalid = ready.patch(f"{base}/items/{item['id']}", json={"front": "sem lacuna", "back": ""})
    assert (invalid.status_code, invalid.json()["code"]) == (422, "VALIDATION_ERROR")
    missing = ready.get(f"{base}/items/999")
    assert (missing.status_code, missing.json()["code"]) == (404, "ITEM_NOT_FOUND")
    assert ready.get(f"{base}/items", params={"status": "weird"}).status_code == 422
    assert ready.get(f"{base}/items", params={"limit": 501}).status_code == 422
