# Filename: test_openrouter.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from mind.errors import ProviderError, ProviderKeyMissing
from mind.llm.openrouter import OpenRouterProvider
from mind.llm.types import Message
from mind.secrets import ENV_NAME, SecretStore

MESSAGES = [Message(role="user", content="question")]


class Answer(BaseModel):
    text: str


def reply(content: str, *, cost: float | None = 0.001) -> httpx.Response:
    usage: dict[str, Any] = {"prompt_tokens": 10, "completion_tokens": 4}
    if cost is not None:
        usage["cost"] = cost
    return httpx.Response(
        200, json={"choices": [{"message": {"content": content}}], "usage": usage}
    )


async def no_sleep(_seconds: float) -> None:
    return None


def make_provider(
    tmp_path: Path,
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    key: str | None = "sk-or-test-key",
) -> OpenRouterProvider:
    env = {ENV_NAME: key} if key else {}
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OpenRouterProvider(SecretStore(tmp_path, env=env), client=client, sleep=no_sleep)


async def test_structured_request_and_usage(tmp_path: Path) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply('{"text": "hi"}')

    provider = make_provider(tmp_path, handler)
    parsed, usage = await provider.complete(MESSAGES, Answer, model="vendor/model")

    assert parsed == Answer(text="hi")
    assert (usage.prompt_tokens, usage.completion_tokens, usage.cost_usd) == (10, 4, 0.001)
    request = seen[0]
    body = json.loads(request.content)
    assert request.headers["authorization"] == "Bearer sk-or-test-key"
    assert body["model"] == "vendor/model"
    assert body["response_format"]["type"] == "json_schema"
    assert body["usage"] == {"include": True}
    assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"


async def test_falls_back_to_prompt_schema_when_structured_mode_is_unsupported(
    tmp_path: Path,
) -> None:
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if "response_format" in body:
            return httpx.Response(400, text="response_format is not supported by this model")
        return reply('```json\n{"text": "ok"}\n```')

    parsed, _ = await make_provider(tmp_path, handler).complete(MESSAGES, Answer, model="m")

    assert parsed.text == "ok"
    assert len(bodies) == 2
    assert "response_format" not in bodies[1]
    assert bodies[1]["messages"][0]["role"] == "system"
    assert "JSON Schema" in bodies[1]["messages"][0]["content"]


async def test_invalid_json_is_retried_with_the_error_and_usage_accumulates(
    tmp_path: Path,
) -> None:
    answers = iter(["not json", '{"wrong": 1}', '{"text": "fine"}'])
    bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        bodies.append(json.loads(request.content))
        return reply(next(answers))

    parsed, usage = await make_provider(tmp_path, handler).complete(MESSAGES, Answer, model="m")

    assert parsed.text == "fine"
    assert usage.prompt_tokens == 30
    assert usage.cost_usd == pytest.approx(0.003)
    assert "invalid" in bodies[1]["messages"][-1]["content"]


async def test_gives_up_after_the_retry_budget(tmp_path: Path) -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return reply("never valid")

    with pytest.raises(ProviderError):
        await make_provider(tmp_path, handler).complete(MESSAGES, Answer, model="m", max_retries=2)
    assert calls == 3


async def test_rate_limit_is_retried_once(tmp_path: Path) -> None:
    responses = iter([httpx.Response(429), reply('{"text": "after wait"}')])

    parsed, _ = await make_provider(tmp_path, lambda _r: next(responses)).complete(
        MESSAGES, Answer, model="m"
    )
    assert parsed.text == "after wait"


async def test_persistent_server_error_is_a_provider_error(tmp_path: Path) -> None:
    provider = make_provider(tmp_path, lambda _r: httpx.Response(503))
    with pytest.raises(ProviderError, match="HTTP 503"):
        await provider.complete(MESSAGES, Answer, model="m")


async def test_network_failure_is_a_provider_error(tmp_path: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(ProviderError, match="rede"):
        await make_provider(tmp_path, handler).complete(MESSAGES, Answer, model="m")


@pytest.mark.parametrize("status", [401, 403])
async def test_rejected_key_is_reported_without_leaking_it(tmp_path: Path, status: int) -> None:
    provider = make_provider(tmp_path, lambda _r: httpx.Response(status, text="sk-or-test-key"))
    with pytest.raises(ProviderError) as error:
        await provider.complete(MESSAGES, Answer, model="m")
    assert "sk-or-test-key" not in error.value.detail


async def test_missing_key_never_reaches_the_network(tmp_path: Path) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("the network must not be used without a key")

    with pytest.raises(ProviderKeyMissing):
        await make_provider(tmp_path, handler, key=None).complete(MESSAGES, Answer, model="m")


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(400, text="bad request"),
        httpx.Response(200, text="<html>"),
        httpx.Response(200, json={"choices": []}),
    ],
)
async def test_unexpected_responses_are_provider_errors(
    tmp_path: Path, response: httpx.Response
) -> None:
    with pytest.raises(ProviderError):
        await make_provider(tmp_path, lambda _r: response).complete(MESSAGES, Answer, model="m")


async def test_usage_without_cost_stays_none(tmp_path: Path) -> None:
    provider = make_provider(tmp_path, lambda _r: reply('{"text": "x"}', cost=None))
    _, usage = await provider.complete(MESSAGES, Answer, model="m")
    assert usage.cost_usd is None
