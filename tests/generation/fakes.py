# Filename: fakes.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""A scripted model that answers a card prompt with cards quoting the first excerpt."""

from __future__ import annotations

import re
from collections.abc import Sequence

from mind.generation.schemas import CardBatch, CardOut, SourceRef
from mind.llm.types import Message

EXCERPT = re.compile(r"\[excerpt (\d+) \|[^\]]*\]\n(.+?)(?=\n\n\[excerpt |\Z)", re.S)


def cards_from_prompt(messages: Sequence[Message], model: str) -> CardBatch:
    user = messages[-1].content
    count_match = re.search(r"Create exactly (\d+)", user)
    subtype_match = re.search(r'`subtype` = "(\w+)"', user)
    excerpt = EXCERPT.search(user)
    assert count_match
    assert subtype_match
    assert excerpt
    chunk_id, text = int(excerpt.group(1)), excerpt.group(2)
    subtype = subtype_match.group(1)
    front = {
        "cloze": "Sobre {{c1::energia}} no trecho %d: parte %d.",
        "true_false": "Afirmação %d número %d.",
    }.get(subtype, "Pergunta %d número %d?")
    back = "Verdadeiro. Está no texto." if subtype == "true_false" else "Resposta."
    return CardBatch(
        cards=[
            CardOut(
                subtype=subtype,  # type: ignore[arg-type]
                front=front % (chunk_id, n),
                back=back,
                topic="Biologia",
                source=SourceRef(chunk_id=chunk_id, quote=text[:60]),
            )
            for n in range(int(count_match.group(1)))
        ]
    )
