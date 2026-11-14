# Filename: test_workspaces_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
import os
from pathlib import Path

from fastapi.testclient import TestClient

from mind.api.app import create_api_app

SNAPSHOT = Path(__file__).parent / "openapi_v1.json"
PROBLEM = "application/problem+json"


def test_openapi_matches_the_committed_snapshot() -> None:
    schema = create_api_app().openapi()
    rendered = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if os.environ.get("UPDATE_SNAPSHOTS") == "1":
        SNAPSHOT.write_text(rendered, encoding="utf-8")
    assert SNAPSHOT.read_text(encoding="utf-8") == rendered, (
        "The API contract changed. Review the diff and rerun with UPDATE_SNAPSHOTS=1."
    )


def test_workspace_crud_over_the_api(client: TestClient) -> None:
    assert client.get("/api/v1/workspaces").json() == []

    created = client.post("/api/v1/workspaces", json={"name": "Biology"})
    assert created.status_code == 201
    workspace = created.json()
    assert workspace["name"] == "Biology"

    url = f"/api/v1/workspaces/{workspace['id']}"
    assert client.get(url).json()["name"] == "Biology"
    assert client.patch(url, json={"name": "Genetics"}).json()["name"] == "Genetics"
    assert [w["name"] for w in client.get("/api/v1/workspaces").json()] == ["Genetics"]

    assert client.delete(url).status_code == 204
    assert client.get(url).status_code == 404


def test_missing_workspace_is_a_problem_json(client: TestClient) -> None:
    response = client.get("/api/v1/workspaces/999")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM)
    body = response.json()
    assert body["code"] == "WORKSPACE_NOT_FOUND"
    assert body["status"] == 404
    assert body["instance"] == "/api/v1/workspaces/999"
    assert body["type"] == "https://mind.local/errors/workspace-not-found"


def test_duplicate_name_reports_a_field_error(client: TestClient) -> None:
    client.post("/api/v1/workspaces", json={"name": "Biology"})
    response = client.post("/api/v1/workspaces", json={"name": "biology"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["errors"][0]["field"] == "name"


def test_malformed_body_is_a_validation_problem(client: TestClient) -> None:
    response = client.post("/api/v1/workspaces", json={"wrong": 1})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM)
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["errors"][0]["field"] == "name"


def test_unknown_api_route_is_a_problem_json(client: TestClient) -> None:
    response = client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_docs_and_openapi_are_served_locally(client: TestClient) -> None:
    openapi = client.get("/api/openapi.json")
    assert openapi.status_code == 200
    assert "/v1/workspaces" in openapi.json()["paths"]

    docs = client.get("/api/docs")
    assert docs.status_code == 200
    assert "/static/vendor/swagger/swagger-ui-bundle.js" in docs.text
    assert "unsafe-inline" in docs.headers["content-security-policy"]
    assert "script-src 'self'" in docs.headers["content-security-policy"]
    assert client.get("/static/vendor/swagger/swagger-ui-bundle.js").status_code == 200
    assert client.get("/static/swagger-init.js").status_code == 200
    assert "unsafe-inline" not in client.get("/welcome").headers["content-security-policy"]
