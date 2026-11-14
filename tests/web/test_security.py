# Filename: test_security.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from fastapi.testclient import TestClient

from mind.config import Settings
from mind.web.security import allowed_hosts


def test_unknown_host_header_is_rejected(client: TestClient) -> None:
    response = client.get("/welcome", headers={"host": "evil.example"})
    assert response.status_code == 400


def test_loopback_hosts_are_accepted(client: TestClient) -> None:
    assert client.get("/welcome", headers={"host": "localhost:8000"}).status_code == 200
    assert client.get("/welcome", headers={"host": "127.0.0.1:8000"}).status_code == 200


def test_cross_origin_post_is_rejected_for_pages_and_api(client: TestClient) -> None:
    foreign = {"origin": "https://evil.example"}
    page = client.post("/workspaces", data={"name": "X"}, headers=foreign)
    api = client.post("/api/v1/workspaces", json={"name": "X"}, headers=foreign)
    assert page.status_code == 403
    assert api.status_code == 403
    assert client.get("/api/v1/workspaces").json() == []


def test_same_origin_post_is_accepted(client: TestClient) -> None:
    response = client.post(
        "/workspaces", data={"name": "Biology"}, headers={"origin": "http://127.0.0.1:8000"}
    )
    assert response.status_code == 303


def test_browser_form_posts_with_a_null_origin_are_accepted_when_fetch_metadata_says_same_origin(
    client: TestClient,
) -> None:
    headers = {"origin": "null", "sec-fetch-site": "same-origin"}
    assert client.post("/workspaces", data={"name": "Biology"}, headers=headers).status_code == 303


def test_a_null_origin_without_fetch_metadata_is_rejected(client: TestClient) -> None:
    response = client.post("/workspaces", data={"name": "X"}, headers={"origin": "null"})
    assert response.status_code == 403


def test_cross_site_fetch_metadata_is_rejected_even_with_a_matching_origin(
    client: TestClient,
) -> None:
    for site in ("cross-site", "same-site"):
        headers = {"origin": "http://127.0.0.1:8000", "sec-fetch-site": site}
        assert client.post("/workspaces", data={"name": "X"}, headers=headers).status_code == 403


def test_pages_send_a_same_origin_referrer_policy(client: TestClient) -> None:
    assert client.get("/welcome").headers["referrer-policy"] == "same-origin"


def test_cross_origin_get_is_not_blocked(client: TestClient) -> None:
    response = client.get("/welcome", headers={"origin": "https://evil.example"})
    assert response.status_code == 200


def test_allowed_hosts_follow_the_bind_address(tmp_path: Path) -> None:
    base = tmp_path
    assert "127.0.0.1" in allowed_hosts(Settings(data_dir=base))
    assert allowed_hosts(Settings(data_dir=base, host="0.0.0.0")) == ["*"]  # noqa: S104
    assert "192.168.0.5" in allowed_hosts(Settings(data_dir=base, host="192.168.0.5"))
