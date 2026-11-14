# Filename: fakes.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""A scripted model that answers a card prompt with cards quoting the first excerpt."""

from __future__ import annotations

import re
from collections.abc import Sequence

from mind.generation.schemas import (
    CardBatch,
    CardOut,
    JudgeBatch,
    OptionOut,
    QuestionBatch,
    QuestionOut,
    SourceRef,
    Verdict,
)
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


def questions_from_prompt(messages: Sequence[Message], model: str) -> QuestionBatch:
    """Answer a question prompt with questions that quote the first excerpt."""
    user = messages[-1].content
    count_match = re.search(r"Create exactly (\d+) questions", user)
    excerpt = EXCERPT.search(user)
    assert count_match
    assert excerpt
    chunk_id, text = int(excerpt.group(1)), excerpt.group(2)
    source = SourceRef(chunk_id=chunk_id, quote=text[:60])
    questions: list[QuestionOut] = []
    for n in range(int(count_match.group(1))):
        statement = f"Afirmação {chunk_id}-{n} sobre a organela."
        if 'Question type "certo_errado"' in user:
            questions.append(
                QuestionOut(
                    subtype="certo_errado",
                    statement=statement,
                    answer="C" if n % 2 == 0 else "E",
                    explanation="Está no texto.",
                    topic="Biologia",
                    source=source,
                )
            )
            continue
        size = 5 if "exactly 5 options" in user else 4
        options = [
            OptionOut(key="ABCDE"[i], text=f"Alternativa {i} da questão {n}", why="Porque sim.")
            for i in range(size)
        ]
        questions.append(
            QuestionOut(
                subtype="multiple_choice",
                statement=statement,
                options=options,
                answer="A",
                explanation="Está no texto.",
                topic="Biologia",
                source=source,
            )
        )
    return QuestionBatch(questions=questions)


def judge_supports_everything(messages: Sequence[Message], model: str) -> JudgeBatch:
    """A judge that accepts every question listed in the prompt."""
    total = len(re.findall(r"\[question \d+\]", messages[-1].content))
    return JudgeBatch(verdicts=[Verdict(index=i, supported=True) for i in range(total)])
