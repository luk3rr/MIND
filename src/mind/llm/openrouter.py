# Filename: openrouter.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""OpenRouter implementation of the `Provider` protocol."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

import httpx
from pydantic import ValidationError

from mind.errors import ProviderError, ProviderKeyMissing
from mind.llm.provider import T
from mind.llm.types import Message, Usage
from mind.secrets import SecretStore

BASE_URL = "https://openrouter.ai/api/v1"
RETRY_STATUSES = {429, 500, 502, 503, 504}
FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.S)


def _extract_json(text: str) -> Any:
    """Parse a JSON answer, tolerating a markdown code fence around it."""
    stripped = text.strip()
    fenced = FENCE.match(stripped)
    return json.loads(fenced.group(1) if fenced else stripped)


def _schema_instruction(schema: type[T]) -> str:
    rendered = json.dumps(schema.model_json_schema(), ensure_ascii=False)
    return (
        "Reply with ONLY a JSON object that validates against this JSON Schema, "
        f"with no extra text:\n{rendered}"
    )


class OpenRouterProvider:
    name = "openrouter"
    requires_consent = True

    def __init__(
        self,
        secrets: SecretStore,
        *,
        client: httpx.AsyncClient | None = None,
        base_url: str = BASE_URL,
        retry_delay: float = 1.0,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._secrets = secrets
        self._client = client or httpx.AsyncClient(timeout=120.0)
        self._base_url = base_url
        self._retry_delay = retry_delay
        self._sleep = sleep

    async def complete(
        self,
        messages: Sequence[Message],
        schema: type[T],
        *,
        model: str,
        max_retries: int = 2,
    ) -> tuple[T, Usage]:
        key = self._secrets.api_key()
        if key is None:
            raise ProviderKeyMissing("Configure a chave do OpenRouter em Configurações.")

        conversation = [m.model_dump() for m in messages]
        structured = True
        total = Usage()
        last_error = "resposta vazia"

        attempt = 0
        while attempt <= max_retries:
            body = self._body(model, conversation, schema, structured)
            response = await self._post(key, body)
            if response.status_code == 400 and structured and "response_format" in response.text:
                structured = False
                continue
            payload = self._ok_payload(response)
            self._accumulate(total, payload.get("usage") or {})
            content = self._content(payload)
            try:
                return schema.model_validate(_extract_json(content)), total
            except (ValueError, ValidationError) as exc:
                last_error = str(exc).splitlines()[0][:200]
                conversation = [
                    *conversation,
                    {"role": "assistant", "content": content},
                    {
                        "role": "user",
                        "content": (
                            f"Your previous answer was invalid ({last_error}). "
                            "Reply again with ONLY valid JSON."
                        ),
                    },
                ]
                attempt += 1
        raise ProviderError(
            f"O modelo não devolveu uma resposta válida após {max_retries + 1} tentativas "
            f"({last_error})."
        )

    def _body(
        self,
        model: str,
        conversation: list[dict[str, str]],
        schema: type[T],
        structured: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "usage": {"include": True}}
        if structured:
            body["messages"] = conversation
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": False,
                    "schema": schema.model_json_schema(),
                },
            }
        else:
            body["messages"] = [
                {"role": "system", "content": _schema_instruction(schema)},
                *conversation,
            ]
        return body

    async def _post(self, key: str, body: dict[str, Any]) -> httpx.Response:
        headers = {"Authorization": f"Bearer {key}", "X-Title": "MIND"}
        last_problem = "falha de rede"
        for attempt in range(2):
            try:
                response = await self._client.post(
                    f"{self._base_url}/chat/completions", json=body, headers=headers
                )
            except httpx.HTTPError as exc:
                last_problem = f"falha de rede ({type(exc).__name__})"
            else:
                if response.status_code not in RETRY_STATUSES:
                    return response
                last_problem = f"HTTP {response.status_code}"
            if attempt == 0:
                await self._sleep(self._retry_delay)
        raise ProviderError(f"O provedor não respondeu: {last_problem}.")

    @staticmethod
    def _ok_payload(response: httpx.Response) -> dict[str, Any]:
        if response.status_code in (401, 403):
            raise ProviderError("Chave de API inválida ou sem permissão.")
        if response.status_code >= 400:
            raise ProviderError(f"O provedor recusou a requisição (HTTP {response.status_code}).")
        try:
            payload: dict[str, Any] = response.json()
        except ValueError as exc:
            raise ProviderError("O provedor devolveu uma resposta ilegível.") from exc
        return payload

    @staticmethod
    def _content(payload: dict[str, Any]) -> str:
        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("O provedor devolveu uma resposta sem conteúdo.") from exc
        return str(content or "")

    @staticmethod
    def _accumulate(total: Usage, usage: dict[str, Any]) -> None:
        total.prompt_tokens += int(usage.get("prompt_tokens") or 0)
        total.completion_tokens += int(usage.get("completion_tokens") or 0)
        cost = usage.get("cost")
        if cost is not None:
            total.cost_usd = (total.cost_usd or 0.0) + float(cost)
