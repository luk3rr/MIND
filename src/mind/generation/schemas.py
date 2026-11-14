# Filename: schemas.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Structured outputs expected from the model (design section 2.8, point 4)."""

from __future__ import annotations

from dataclasses import dataclass
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


QuestionSubtype = Literal["certo_errado", "multiple_choice"]


@dataclass(frozen=True)
class Profile:
    """An exam profile: the question type and, for multiple choice, how many options."""

    subtype: QuestionSubtype
    options: int


PROFILES: dict[str, Profile] = {
    "certo_errado": Profile("certo_errado", 2),
    "multiple_choice_4": Profile("multiple_choice", 4),
    "multiple_choice_5": Profile("multiple_choice", 5),
}


class OptionOut(BaseModel):
    key: str = Field(description='"A", "B", ... in order (multiple choice only).')
    text: str
    why: str = Field(description="Why this option is right or wrong.")


class QuestionOut(BaseModel):
    subtype: QuestionSubtype
    statement: str
    options: list[OptionOut] = Field(
        default_factory=list, description="Leave empty for certo_errado."
    )
    answer: str = Field(description='"C" or "E" for certo_errado, an option key otherwise.')
    explanation: str = Field(description="Short comment that justifies the answer.")
    topic: str | None = Field(default=None, description="Short topic label, up to 5 words.")
    source: SourceRef


class QuestionBatch(BaseModel):
    questions: list[QuestionOut]


class Verdict(BaseModel):
    index: int = Field(description="Position of the question in the list, starting at 0.")
    supported: bool
    reason: str = ""


class JudgeBatch(BaseModel):
    verdicts: list[Verdict]


class QuestionPayload(BaseModel):
    """What is stored in `item.payload_json` for a question."""

    statement: str
    options: list[OptionOut]
    answer: str
    explanation: str
