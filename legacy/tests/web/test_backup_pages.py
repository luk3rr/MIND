# Filename: test_backup_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.web.test_generate_pages import prepare


def test_settings_offers_download_and_import(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/settings").text
    assert f'href="/w/{workspace_id}/export"' in page
    assert 'action="/workspaces/import"' in page
    assert 'action="/workspaces/import"' in ready.get("/welcome").text


def test_a_downloaded_backup_can_be_imported_through_the_page(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    download = ready.get(f"/w/{workspace_id}/export")
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]

    response = ready.post("/workspaces/import", files={"file": ("backup.zip", download.content)})
    assert response.status_code == 303
    page = ready.get(response.headers["location"].replace("/today", "/library/rows")).text
    assert "aula" in page


def test_an_invalid_backup_shows_an_error_page(ready: TestClient) -> None:
    response = ready.post("/workspaces/import", files={"file": ("x.zip", b"junk")})
    assert response.status_code == 422
    assert "não é um .zip válido" in response.text
