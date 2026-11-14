# Filename: types.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Shared types of the LLM layer."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class Usage(BaseModel):
    """Token usage of one call. `cost_usd` is `None` when the provider did not report it."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float | None = None
