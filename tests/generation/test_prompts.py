# Filename: test_prompts.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from pydantic import ValidationError

from mind.generation.prompts import (
    MAX_QUOTE,
    MIN_QUOTE,
    SUBTYPE_RULES,
    PromptChunk,
    build_card_messages,
)
from mind.generation.schemas import CARD_SUBTYPES, CardBatch, CardOut, SourceRef

CHUNKS = [
    PromptChunk(id=7, label="Aula p.3", text="A célula é a unidade da vida."),
    PromptChunk(id=8, label="Aula p.4", text="O núcleo guarda o DNA."),
]


@pytest.mark.parametrize("subtype", CARD_SUBTYPES)
def test_every_subtype_has_rules_and_builds_a_prompt(subtype: str) -> None:
    assert subtype in SUBTYPE_RULES
    system, user = build_card_messages(subtype, 5, CHUNKS)
    assert (system.role, user.role) == ("system", "user")
    assert f'`subtype` = "{subtype}"' in user.content
    assert "Create exactly 5 flashcards" in user.content


def test_prompt_demands_ptbr_verbatim_quotes_and_latex() -> None:
    system = build_card_messages("qa", 1, CHUNKS)[0].content
    assert "pt-BR" in system
    assert "VERBATIM" in system
    assert str(MIN_QUOTE) in system
    assert str(MAX_QUOTE) in system
    assert "LaTeX" in system
    assert "ONLY information" in system


def test_chunks_are_rendered_with_their_ids_and_labels() -> None:
    user = build_card_messages("qa", 2, CHUNKS)[1].content
    assert "[excerpt 7 | Aula p.3]\nA célula é a unidade da vida." in user
    assert "[excerpt 8 | Aula p.4]" in user


def test_cloze_and_true_false_rules_describe_their_format() -> None:
    assert "{{c1::term}}" in SUBTYPE_RULES["cloze"]
    assert "Verdadeiro" in SUBTYPE_RULES["true_false"]
    assert "table" in SUBTYPE_RULES["compare"]


def test_card_schema_accepts_a_valid_batch_and_rejects_unknown_subtypes() -> None:
    card = {
        "subtype": "qa",
        "front": "Q?",
        "back": "A",
        "topic": None,
        "source": {"chunk_id": 1, "quote": "texto copiado do trecho"},
    }
    batch = CardBatch.model_validate({"cards": [card]})
    assert batch.cards[0].source == SourceRef(chunk_id=1, quote="texto copiado do trecho")
    with pytest.raises(ValidationError):
        CardOut.model_validate({**card, "subtype": "essay"})
    with pytest.raises(ValidationError):
        CardOut.model_validate({k: v for k, v in card.items() if k != "source"})
