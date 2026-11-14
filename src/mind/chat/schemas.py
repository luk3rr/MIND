# Filename: schemas.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Structured output expected from the model for a chat answer."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatCitation(BaseModel):
    chunk_id: int = Field(description="Id of the excerpt that supports the answer.")
    quote: str = Field(description="Text copied verbatim from that excerpt.")


class ChatAnswer(BaseModel):
    supported: bool = Field(description="False when the excerpts do not answer the question.")
    answer: str = Field(description="The answer in Brazilian Portuguese, using only the excerpts.")
    citations: list[ChatCitation] = Field(default_factory=list)
