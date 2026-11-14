# Filename: test_shell.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from mind.web.strings import SECTIONS


def create_workspace(client: TestClient, name: str = "Biology") -> int:
    response = client.post("/workspaces", data={"name": name})
    assert response.status_code == 303
    return int(response.headers["location"].split("/")[2])


def test_index_redirects_to_welcome_without_workspaces(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 303
    assert response.headers["location"] == "/welcome"
    assert client.get("/welcome").status_code == 200


def test_creating_a_workspace_opens_its_today_page(client: TestClient) -> None:
    workspace_id = create_workspace(client)
    page = client.get(f"/w/{workspace_id}/today")
    assert page.status_code == 200
    assert "Biology" in page.text
    assert client.get("/").headers["location"] == f"/w/{workspace_id}/today"


def test_invalid_workspace_name_shows_error_on_the_form(client: TestClient) -> None:
    response = client.post("/workspaces", data={"name": "   "})
    assert response.status_code == 422
    assert 'role="alert"' in response.text


def test_sidebar_lists_every_section_and_workspace(client: TestClient) -> None:
    first = create_workspace(client, "Biology")
    create_workspace(client, "Calculus")
    page = client.get(f"/w/{first}/today").text
    for slug, label in SECTIONS:
        assert f'href="/w/{first}/{slug}"' in page
        assert label in page
    assert "Calculus" in page
    assert 'aria-current="page"' in page


def test_other_sections_show_coming_soon(client: TestClient) -> None:
    workspace_id = create_workspace(client)
    page = client.get(f"/w/{workspace_id}/study")
    assert page.status_code == 200
    assert "Em breve" in page.text


def test_unknown_workspace_and_section_return_404(client: TestClient) -> None:
    workspace_id = create_workspace(client)
    assert client.get("/w/999/today").status_code == 404
    assert client.get(f"/w/{workspace_id}/nope").status_code == 404


def test_rename_and_delete_flow(client: TestClient) -> None:
    workspace_id = create_workspace(client, "Old name")
    assert client.get(f"/w/{workspace_id}/settings").status_code == 200

    renamed = client.post(f"/w/{workspace_id}/rename", data={"name": "New name"})
    assert renamed.status_code == 303
    assert "New name" in client.get(f"/w/{workspace_id}/today").text

    wrong = client.post(f"/w/{workspace_id}/delete", data={"confirm": "other"})
    assert wrong.status_code == 422
    assert client.get(f"/w/{workspace_id}/today").status_code == 200

    done = client.post(f"/w/{workspace_id}/delete", data={"confirm": "New name"})
    assert done.status_code == 303
    assert client.get(f"/w/{workspace_id}/today").status_code == 404


def test_responses_carry_security_headers(client: TestClient) -> None:
    response = client.get("/welcome")
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "same-origin"


def test_static_assets_are_served_locally(client: TestClient) -> None:
    for path in (
        "/static/app.css",
        "/static/theme.js",
        "/static/math.js",
        "/static/vendor/htmx.min.js",
        "/static/vendor/katex/katex.min.js",
        "/static/vendor/katex/katex.min.css",
        "/static/vendor/fonts/inter-latin-400-normal.woff2",
        "/static/vendor/fonts/jetbrains-mono-latin-400-normal.woff2",
    ):
        assert client.get(path).status_code == 200, path
