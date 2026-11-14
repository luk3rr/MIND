# Filename: fake.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Deterministic provider for tests and for running the app without an API key."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from pydantic import BaseModel

from mind.errors import ProviderError
from mind.llm.provider import T
from mind.llm.types import Message, Usage

Handler = Callable[[Sequence[Message], str], BaseModel]


@dataclass
class Call:
    messages: list[Message]
    schema: type[BaseModel]
    model: str


@dataclass
class FakeProvider:
    """Answers with scripted responses chosen by the requested schema."""

    name: str = "fake"
    requires_consent: bool = False
    usage: Usage = field(default_factory=lambda: Usage(prompt_tokens=10, completion_tokens=5))
    calls: list[Call] = field(default_factory=list)
    _handlers: dict[type[BaseModel], Handler] = field(default_factory=dict)

    def script(self, schema: type[BaseModel], response: BaseModel | Handler) -> None:
        """Register a constant response or a function of (messages, model) for `schema`."""
        if isinstance(response, BaseModel):
            constant = response
            self._handlers[schema] = lambda _messages, _model: constant
        else:
            self._handlers[schema] = response

    async def complete(
        self,
        messages: Sequence[Message],
        schema: type[T],
        *,
        model: str,
        max_retries: int = 2,
    ) -> tuple[T, Usage]:
        self.calls.append(Call(list(messages), schema, model))
        handler = self._handlers.get(schema)
        if handler is None:
            raise ProviderError(f"No scripted response for {schema.__name__}.")
        result = handler(messages, model)
        return schema.model_validate(result.model_dump()), self.usage
