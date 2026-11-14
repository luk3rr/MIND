# Filename: test_provider_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import stat
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from mind.config import Settings
from mind.secrets import ENV_NAME
from mind.web.app import create_app

KEY = "sk-or-v1-topsecretvalue"
FORM = {
    "api_key": KEY,
    "generation_model": "vendor/cheap",
    "judge_model": "vendor/strong",
    "monthly_limit_usd": "3.5",
}


def all_pages(client: TestClient) -> str:
    return "".join(client.get(path).text for path in ("/setup", "/setup?step=2", "/settings"))


def test_banner_shows_until_key_and_consent_are_set(client: TestClient) -> None:
    client.post("/workspaces", data={"name": "Biology"})
    assert "/setup" in client.get("/w/1/today").text

    client.post("/setup/key", data=FORM)
    assert "/setup" in client.get("/w/1/today").text

    assert client.post("/setup/consent").status_code == 303
    assert 'role="status"' not in client.get("/w/1/today").text


def test_setup_saves_key_privately_and_never_echoes_it(client: TestClient, tmp_path: Path) -> None:
    response = client.post("/setup/key", data=FORM)
    assert response.status_code == 303
    assert response.headers["location"] == "/setup?step=2"

    env_file = tmp_path / ".env"
    assert f"{ENV_NAME}={KEY}" in env_file.read_text()
    assert stat.S_IMODE(env_file.stat().st_mode) == 0o600
    assert KEY not in all_pages(client)
    assert "vendor/cheap" in client.get("/settings").text
    assert "Chave configurada (arquivo .env)" in client.get("/settings").text


def test_blank_key_keeps_the_current_one(client: TestClient, tmp_path: Path) -> None:
    client.post("/setup/key", data=FORM)
    client.post("/settings", data={**FORM, "api_key": "", "generation_model": "vendor/other"})
    assert f"{ENV_NAME}={KEY}" in (tmp_path / ".env").read_text()
    assert "vendor/other" in client.get("/settings").text


def test_invalid_values_rerender_the_form_with_an_alert(client: TestClient) -> None:
    response = client.post("/settings", data={**FORM, "monthly_limit_usd": "-3"})
    assert response.status_code == 422
    assert 'role="alert"' in response.text
    assert "/settings" in response.text


def test_consent_can_be_revoked_and_the_key_removed(client: TestClient, tmp_path: Path) -> None:
    client.post("/setup/key", data=FORM)
    client.post("/settings/consent", data={"action": "give"})
    assert "Envio de trechos aceito" in client.get("/settings").text

    client.post("/settings/consent", data={"action": "revoke"})
    assert "ainda não aceito" in client.get("/settings").text

    client.post("/settings/key/clear")
    assert KEY not in (tmp_path / ".env").read_text()
    assert "Nenhuma chave configurada" in client.get("/settings").text


def test_model_catalog_refresh_fills_the_datalist(tmp_path: Path) -> None:
    catalog = {
        "data": [{"id": "vendor/one", "pricing": {"prompt": "0.000001", "completion": "0.000002"}}]
    }
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=catalog))
    )
    app = create_app(Settings(data_dir=tmp_path), http_client=http)
    with TestClient(app, base_url="http://127.0.0.1:8000", follow_redirects=False) as client:
        assert "vendor/one" not in client.get("/settings").text
        assert client.post("/settings/models/refresh").status_code == 303
        assert 'value="vendor/one"' in client.get("/settings").text
