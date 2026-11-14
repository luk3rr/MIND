# Filename: test_backup_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import io
import zipfile

from fastapi.testclient import TestClient

from tests.api.test_generations_contract import prepare


def test_a_backup_downloads_and_imports_as_a_new_workspace(ready: TestClient) -> None:
    base = prepare(ready)
    download = ready.get(f"{base}/export")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/zip"
    assert download.headers["content-disposition"].startswith('attachment; filename="mind-study-')
    with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
        assert {"manifest.json", "workspace.db"} <= set(archive.namelist())

    created = ready.post(
        "/api/v1/workspaces/import", files={"file": ("backup.zip", download.content)}
    )
    assert created.status_code == 201
    copy = created.json()
    assert copy["name"] == "Study (importado)"
    materials = ready.get(f"/api/v1/workspaces/{copy['id']}/materials").json()
    assert [m["title"] for m in materials] == ["aula"]
    assert materials[0]["status"] == "indexed"


def test_invalid_backups_and_unknown_workspaces_are_problem_documents(ready: TestClient) -> None:
    assert ready.get("/api/v1/workspaces/77/export").status_code == 404
    refused = ready.post("/api/v1/workspaces/import", files={"file": ("x.zip", b"not a zip")})
    assert (refused.status_code, refused.json()["code"]) == (422, "ARCHIVE_INVALID")
