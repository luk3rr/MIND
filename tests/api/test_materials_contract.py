# Filename: test_materials_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import wait_for
from tests.ingestion.pdfs import make_pdf

PROBLEM = "application/problem+json"


def workspace(client: TestClient) -> str:
    created = client.post("/api/v1/workspaces", json={"name": "Study"}).json()
    return f"/api/v1/workspaces/{created['id']}"


def import_text(client: TestClient, base: str, name: str, content: bytes) -> dict[str, object]:
    response = client.post(f"{base}/materials", files={"file": (name, content, "text/plain")})
    assert response.status_code == 202
    material: dict[str, object] = response.json()
    wait_for(lambda: client.get(f"{base}/materials/{material['id']}").json()["status"] != "queued")
    wait_for(lambda: client.get(f"{base}/materials/{material['id']}").json()["status"] == "indexed")
    return material


def test_import_returns_202_with_the_job_to_follow(client: TestClient) -> None:
    base = workspace(client)
    response = client.post(
        f"{base}/materials", files={"file": ("notes.md", b"# T\n\nhello", "text/markdown")}
    )
    assert response.status_code == 202
    body = response.json()
    assert (body["title"], body["kind"], body["status"]) == ("notes", "text", "queued")
    job = client.get(f"{base}/jobs/{body['job_id']}")
    assert job.status_code == 200


def test_list_get_chunks_and_delete(client: TestClient) -> None:
    base = workspace(client)
    material = import_text(client, base, "a.md", b"# One\n\nfirst\n\n# Two\n\nsecond")
    material_id = material["id"]

    listed = client.get(f"{base}/materials").json()
    assert [m["id"] for m in listed] == [material_id]
    chunks = client.get(f"{base}/materials/{material_id}/chunks").json()
    assert [c["section"] for c in chunks] == ["One", "Two"]
    paged = client.get(f"{base}/materials/{material_id}/chunks?offset=1&limit=1").json()
    assert [c["text"] for c in paged] == ["second"]

    assert client.delete(f"{base}/materials/{material_id}").status_code == 204
    assert client.get(f"{base}/materials/{material_id}").status_code == 404
    assert client.get(f"{base}/materials").json() == []


def test_pdf_chunks_can_be_filtered_by_page(client: TestClient, tmp_path: Path) -> None:
    base = workspace(client)
    pdf = make_pdf(tmp_path / "x.pdf", ["alpha page", "beta page"])
    response = client.post(
        f"{base}/materials", files={"file": ("x.pdf", pdf.read_bytes(), "application/pdf")}
    )
    material_id = response.json()["id"]
    wait_for(lambda: client.get(f"{base}/materials/{material_id}").json()["status"] == "indexed")

    page_two = client.get(f"{base}/materials/{material_id}/chunks?page=2").json()
    assert [c["page"] for c in page_two] == [2]
    assert client.get(f"{base}/materials/{material_id}/chunks?page=0").status_code == 422


def test_search_finds_chunks_and_applies_filters(client: TestClient) -> None:
    base = workspace(client)
    first = import_text(client, base, "bio.txt", "A mitocôndria produz energia.".encode())
    import_text(client, base, "phy.txt", b"Energy and mass.")

    hits = client.get(f"{base}/search", params={"q": "mitocondria"}).json()
    assert [(h["material_title"], h["material_id"]) for h in hits] == [("bio", first["id"])]
    assert hits[0]["score"] > 0

    both = client.get(f"{base}/search", params={"q": "energia energy"}).json()
    assert {h["material_title"] for h in both} == {"bio", "phy"}
    only = client.get(f"{base}/search", params={"q": "energia energy", "material_id": first["id"]})
    assert [h["material_title"] for h in only.json()] == ["bio"]
    assert client.get(f"{base}/search", params={"q": "zzz"}).json() == []
    assert client.get(f"{base}/search", params={"q": ""}).status_code == 422
    assert client.get(f"{base}/search", params={"q": "a", "limit": 51}).status_code == 422


def test_errors_are_problem_json(client: TestClient) -> None:
    base = workspace(client)
    bad = client.post(f"{base}/materials", files={"file": ("x.pptx", b"x", "application/zip")})
    assert bad.status_code == 415
    assert bad.headers["content-type"].startswith(PROBLEM)
    assert bad.json()["code"] == "UNSUPPORTED_FILE"

    missing = client.get(f"{base}/materials/99")
    assert (missing.status_code, missing.json()["code"]) == (404, "MATERIAL_NOT_FOUND")
    assert client.get("/api/v1/workspaces/77/materials").json()["code"] == "WORKSPACE_NOT_FOUND"
    assert client.get("/api/v1/workspaces/77/search", params={"q": "a"}).status_code == 404
    no_file = client.post(f"{base}/materials")
    assert (no_file.status_code, no_file.json()["code"]) == (422, "VALIDATION_ERROR")
