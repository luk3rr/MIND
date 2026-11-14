# Filename: schemas.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Structured outputs expected from the model (design section 2.8, point 4)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CardSubtype = Literal["qa", "cloze", "compare", "true_false"]
CARD_SUBTYPES: tuple[str, ...] = ("qa", "cloze", "compare", "true_false")


class SourceRef(BaseModel):
    chunk_id: int = Field(description="Id of the excerpt that supports the card.")
    quote: str = Field(description="Text copied verbatim from that excerpt.")


class CardOut(BaseModel):
    subtype: CardSubtype
    front: str
    back: str
    topic: str | None = Field(default=None, description="Short topic label, up to 5 words.")
    source: SourceRef


class CardBatch(BaseModel):
    cards: list[CardOut]


class CardPayload(BaseModel):
    """What is stored in `item.payload_json` for a card (the source lives on the item)."""

    front: str
    back: str
