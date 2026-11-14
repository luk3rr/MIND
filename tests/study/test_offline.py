# Filename: test_offline.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from mind.config import Settings
from mind.generation.schemas import CardBatch
from mind.llm.fake import FakeProvider
from mind.web.app import create_app
from tests.generation.fakes import cards_from_prompt
from tests.web.test_generate_pages import generate, prepare


def test_studying_never_touches_the_provider_or_the_network(tmp_path: Path) -> None:
    network_calls: list[str] = []

    def forbidden(request: httpx.Request) -> httpx.Response:
        network_calls.append(str(request.url))
        raise httpx.ConnectError("offline", request=request)

    fake = FakeProvider(name="openrouter", requires_consent=False)
    fake.script(CardBatch, cards_from_prompt)
    app = create_app(
        Settings(data_dir=tmp_path),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(forbidden)),
        inner_provider=fake,
    )
    with TestClient(app, base_url="http://127.0.0.1:8000", follow_redirects=False) as client:
        workspace_id = prepare(client)
        generate(client, workspace_id)
        client.post(f"/w/{workspace_id}/review/approve-all", data={"run": "1"})
        calls_before = len(fake.calls)

        def no_more_model_calls(*_args: object, **_kwargs: object) -> CardBatch:
            raise AssertionError("the model must not be called while studying")

        fake.script(CardBatch, no_more_model_calls)

        assert client.get(f"/w/{workspace_id}/today").status_code == 200
        study = client.get(f"/w/{workspace_id}/study")
        assert study.status_code == 200
        client.post(
            f"/w/{workspace_id}/study/rate",
            data={"item_id": "1", "rating": "3"},
            headers={"hx-request": "true"},
        )
        client.post(f"/w/{workspace_id}/study/undo", headers={"hx-request": "true"})

        assert len(fake.calls) == calls_before
    assert network_calls == []
