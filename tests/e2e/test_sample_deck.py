# Filename: test_sample_deck.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The path of the README: sample material -> cards with sources -> approved -> studied."""

from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import wait_for

SAMPLE = Path(__file__).parents[2] / "samples" / "fotossintese.md"


def test_the_sample_leads_to_a_first_deck(ready: TestClient) -> None:
    workspace = ready.post("/api/v1/workspaces", json={"name": "Amostra"}).json()["id"]
    base = f"/api/v1/workspaces/{workspace}"
    ready.post(
        f"{base}/materials", files={"file": (SAMPLE.name, SAMPLE.read_bytes(), "text/markdown")}
    )
    wait_for(lambda: ready.get(f"{base}/materials/1").json()["status"] == "indexed")

    run = ready.post(
        f"{base}/generations", json={"material_id": 1, "subtype": "qa", "quantity": 10}
    ).json()
    wait_for(lambda: ready.get(f"{base}/generations/{run['id']}").json()["status"] == "done")

    drafts = ready.get(f"{base}/items", params={"status": "draft", "run_id": run["id"]}).json()
    assert len(drafts) == 10
    assert all(d["quote"] and d["source_title"] == "fotossintese" for d in drafts)

    ready.post(f"{base}/items/review", json={"approve": [d["id"] for d in drafts]})
    summary = ready.get(f"{base}/study/summary").json()
    assert summary["new_available"] > 0
