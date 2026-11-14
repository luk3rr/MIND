# Filename: provider.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The `Provider` protocol: the single door to language models (design ADR-6)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, TypeVar

from pydantic import BaseModel

from mind.llm.types import Message, Usage

T = TypeVar("T", bound=BaseModel)


class Provider(Protocol):
    """Asks a model for a structured answer validated by a Pydantic schema."""

    name: str
    requires_consent: bool

    async def complete(
        self,
        messages: Sequence[Message],
        schema: type[T],
        *,
        model: str,
        max_retries: int = 2,
    ) -> tuple[T, Usage]: ...
