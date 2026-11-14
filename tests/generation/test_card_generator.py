# Filename: test_card_generator.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from typing import Any

import pytest
from sqlalchemy import select

from mind.db.workspace_models import Item, Topic
from mind.generation.cards import BatchOutcome, card_problem, clean_topic
from mind.generation.schemas import CardBatch, CardOut, SourceRef
from mind.llm.types import Usage
from tests.generation.conftest import Rig

QUOTE = "A mitocôndria é a organela responsável pela respiração celular"


def card(
    rig: Rig,
    *,
    front: str = "Qual organela realiza a respiração celular?",
    back: str = "A mitocôndria.",
    subtype: str = "qa",
    quote: str = QUOTE,
    chunk_id: int | None = None,
    topic: str | None = "Biologia celular",
) -> CardOut:
    return CardOut.model_validate(
        {
            "subtype": subtype,
            "front": front,
            "back": back,
            "topic": topic,
            "source": SourceRef(chunk_id=chunk_id or rig.chunk.id, quote=quote),
        }
    )


async def run_batch(
    rig: Rig, cards: list[CardOut], *, subtype: str = "qa", remaining: int = 10
) -> BatchOutcome:
    rig.fake.script(CardBatch, CardBatch(cards=cards))
    return await rig.generator.generate_batch(
        run_id=rig.run_id,
        subtype=subtype,
        count=len(cards),
        chunks=[rig.chunk],
        model="vendor/m",
        remaining=remaining,
    )


def items(rig: Rig) -> list[Item]:
    with rig.workspace() as session:
        return list(session.scalars(select(Item).order_by(Item.id)))


async def test_a_valid_card_is_stored_as_a_draft_with_a_copied_source(rig: Rig) -> None:
    outcome = await run_batch(rig, [card(rig)])

    assert (outcome.accepted, outcome.no_source, outcome.invalid, outcome.duplicate) == (1, 0, 0, 0)
    [item] = items(rig)
    assert (item.status, item.kind, item.subtype, item.origin) == (
        "draft",
        "card",
        "qa",
        "generated",
    )
    assert json.loads(item.payload_json) == {
        "front": "Qual organela realiza a respiração celular?",
        "back": "A mitocôndria.",
    }
    assert (item.source_title, item.source_page, item.chunk_id) == ("Aula", 3, rig.chunk.id)
    assert item.quote == QUOTE
    assert item.edited is False


async def test_the_prompt_sends_only_the_batch_excerpts_and_the_requested_model(rig: Rig) -> None:
    await run_batch(rig, [card(rig)])
    call = rig.fake.calls[0]
    assert call.model == "vendor/m"
    sent = " ".join(m.content for m in call.messages)
    assert f"[excerpt {rig.chunk.id} | Aula p.3]" in sent
    assert "respiração celular" in sent


@pytest.mark.parametrize(
    ("quote", "chunk_id_offset"),
    [
        ("a mitocôndria cria energia para tudo", 0),  # not in the chunk
        ("organela", 0),  # too short
        (QUOTE, 999),  # chunk that was not part of the batch
    ],
)
async def test_cards_without_a_verifiable_source_are_discarded_and_counted(
    rig: Rig, quote: str, chunk_id_offset: int
) -> None:
    bad = card(rig, quote=quote, chunk_id=rig.chunk.id + chunk_id_offset)
    outcome = await run_batch(rig, [bad, card(rig, front="Outra pergunta válida sobre isso?")])

    assert (outcome.accepted, outcome.no_source) == (1, 1)
    assert len(items(rig)) == 1
    assert outcome.log[0]["reason"] in {
        "quote_not_in_chunk",
        "quote_too_short",
        "chunk_not_in_batch",
    }


@pytest.mark.parametrize(
    ("kwargs", "subtype", "reason"),
    [
        ({"front": "   "}, "qa", "empty_front"),
        ({"back": ""}, "qa", "empty_back"),
        ({"subtype": "cloze", "front": "sem lacuna aqui"}, "cloze", "cloze_without_gap"),
        ({"subtype": "true_false", "back": "Talvez."}, "true_false", "true_false_without_verdict"),
        ({"subtype": "cloze", "front": "x {{c1::y}}"}, "qa", "wrong_subtype"),
    ],
)
async def test_malformed_cards_are_discarded_as_invalid(
    rig: Rig, kwargs: dict[str, Any], subtype: str, reason: str
) -> None:
    outcome = await run_batch(rig, [card(rig, **kwargs)], subtype=subtype)
    assert (outcome.accepted, outcome.invalid) == (0, 1)
    assert outcome.log[0]["reason"] == reason
    assert items(rig) == []


async def test_valid_cloze_and_true_false_cards_are_accepted(rig: Rig) -> None:
    cloze = card(rig, subtype="cloze", front="A {{c1::mitocôndria}} faz respiração.", back="")
    outcome = await run_batch(rig, [cloze], subtype="cloze")
    assert outcome.accepted == 1
    verdict = card(
        rig,
        subtype="true_false",
        front="O núcleo faz a respiração.",
        back="Falso. É a mitocôndria.",
    )
    outcome = await run_batch(rig, [verdict], subtype="true_false")
    assert outcome.accepted == 1


async def test_duplicates_inside_the_batch_and_against_existing_items_are_dropped(
    rig: Rig,
) -> None:
    first = card(rig)
    same_in_batch = card(rig, front="  qual ORGANELA realiza a respiração celular? ")
    outcome = await run_batch(rig, [first, same_in_batch])
    assert (outcome.accepted, outcome.duplicate) == (1, 1)

    again = await run_batch(rig, [card(rig)])
    assert (again.accepted, again.duplicate) == (0, 1)
    assert len(items(rig)) == 1


async def test_only_the_remaining_quota_is_stored(rig: Rig) -> None:
    cards = [card(rig, front=f"Pergunta número {i} sobre a organela?") for i in range(4)]
    outcome = await run_batch(rig, cards, remaining=2)
    assert outcome.accepted == 2
    assert len(items(rig)) == 2


async def test_topics_are_created_once_ignoring_case_and_spacing(rig: Rig) -> None:
    cards = [
        card(rig, front="Pergunta um sobre a célula?", topic="Biologia  Celular"),
        card(rig, front="Pergunta dois sobre a célula?", topic="biologia celular"),
        card(rig, front="Pergunta três sobre a célula?", topic=None),
    ]
    await run_batch(rig, cards)
    with rig.workspace() as session:
        assert [t.name for t in session.scalars(select(Topic))] == ["Biologia Celular"]
    assert [i.topic_id is not None for i in items(rig)] == [True, True, False]


async def test_the_batch_cost_comes_from_the_recorded_usage(rig: Rig) -> None:
    rig.fake.usage = Usage(prompt_tokens=10, completion_tokens=10, cost_usd=0.07)
    outcome = await run_batch(rig, [card(rig)])
    assert outcome.cost_usd == pytest.approx(0.07)


def test_card_problem_and_clean_topic_helpers() -> None:
    assert clean_topic("  a   b ") == "a b"
    assert clean_topic("   ") is None
    assert clean_topic(None) is None
    assert len(clean_topic("x" * 200) or "") == 80
    assert (
        card_problem(
            CardOut.model_validate(
                {
                    "subtype": "qa",
                    "front": "f",
                    "back": "b",
                    "source": {"chunk_id": 1, "quote": "q"},
                }
            ),
            "qa",
        )
        is None
    )
