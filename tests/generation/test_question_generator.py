# Filename: test_question_generator.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from typing import Any

import pytest
from sqlalchemy import select

from mind.db.workspace_models import Item
from mind.generation.cards import BatchOutcome
from mind.generation.questions import QuestionGenerator, payload_for, question_problem
from mind.generation.schemas import (
    JudgeBatch,
    OptionOut,
    QuestionBatch,
    QuestionOut,
    SourceRef,
    Verdict,
)
from mind.llm.types import Usage
from tests.generation.conftest import Rig

QUOTE = "A mitocôndria é a organela responsável pela respiração celular"


def tf(
    rig: Rig, statement: str = "A mitocôndria realiza a respiração celular.", **kw: Any
) -> QuestionOut:
    data: dict[str, Any] = {
        "subtype": "certo_errado",
        "statement": statement,
        "answer": "C",
        "explanation": "Está no texto.",
        "topic": "Biologia celular",
        "source": SourceRef(chunk_id=rig.chunk.id, quote=QUOTE),
    }
    return QuestionOut.model_validate({**data, **kw})


def mc(
    rig: Rig, count: int = 4, statement: str = "Qual organela faz a respiração celular?", **kw: Any
) -> QuestionOut:
    names = ["Mitocôndria", "Núcleo", "Ribossomo", "Lisossomo", "Golgi"][:count]
    options = [
        OptionOut(key="ABCDE"[i], text=name, why=f"Porque {name}.") for i, name in enumerate(names)
    ]
    data: dict[str, Any] = {
        "subtype": "multiple_choice",
        "statement": statement,
        "options": options,
        "answer": "A",
        "explanation": "A mitocôndria respira.",
        "source": SourceRef(chunk_id=rig.chunk.id, quote=QUOTE),
    }
    return QuestionOut.model_validate({**data, **kw})


async def run(
    rig: Rig,
    questions: list[QuestionOut],
    verdicts: list[Verdict] | None = None,
    *,
    profile: str = "certo_errado",
    remaining: int = 10,
) -> BatchOutcome:
    rig.fake.script(QuestionBatch, QuestionBatch(questions=questions))
    all_good = [Verdict(index=i, supported=True) for i in range(len(questions))]
    rig.fake.script(JudgeBatch, JudgeBatch(verdicts=all_good if verdicts is None else verdicts))
    return await QuestionGenerator(rig.workspace, rig.guarded).generate_batch(
        run_id=rig.run_id,
        profile=profile,
        count=len(questions),
        chunks=[rig.chunk],
        model="vendor/gen",
        judge_model="vendor/judge",
        remaining=lambda: remaining,
    )


def items(rig: Rig) -> list[Item]:
    with rig.workspace() as session:
        return list(session.scalars(select(Item).order_by(Item.id)))


async def test_a_verified_true_false_question_is_stored_with_generated_options(rig: Rig) -> None:
    outcome = await run(rig, [tf(rig)])
    assert (outcome.accepted, outcome.no_source, outcome.invalid, outcome.unsupported) == (
        1,
        0,
        0,
        0,
    )
    [item] = items(rig)
    assert (item.kind, item.subtype, item.status) == ("question", "certo_errado", "draft")
    payload = json.loads(item.payload_json)
    assert payload["answer"] == "C"
    assert [(o["key"], o["text"]) for o in payload["options"]] == [("C", "Certo"), ("E", "Errado")]
    assert (item.source_title, item.source_page, item.quote) == ("Aula", 3, QUOTE)


async def test_a_multiple_choice_question_keeps_every_option_and_its_explanation(rig: Rig) -> None:
    outcome = await run(rig, [mc(rig)], profile="multiple_choice_4")
    assert outcome.accepted == 1
    payload = json.loads(items(rig)[0].payload_json)
    assert [o["key"] for o in payload["options"]] == ["A", "B", "C", "D"]
    assert payload["options"][1]["why"] == "Porque Núcleo."
    assert payload["explanation"] == "A mitocôndria respira."


async def test_generator_and_judge_use_their_own_models_and_costs_add_up(rig: Rig) -> None:
    rig.fake.usage = Usage(prompt_tokens=1, completion_tokens=1, cost_usd=0.05)
    outcome = await run(rig, [tf(rig)])
    assert [c.model for c in rig.fake.calls] == ["vendor/gen", "vendor/judge"]
    assert outcome.cost_usd == pytest.approx(0.10)
    judge_prompt = rig.fake.calls[1].messages[1].content
    assert "organela responsável pela respiração celular" in judge_prompt


async def test_questions_the_judge_rejects_never_become_drafts(rig: Rig) -> None:
    questions = [tf(rig), tf(rig, "O núcleo produz a energia da célula.", answer="C")]
    verdicts = [
        Verdict(index=0, supported=True),
        Verdict(index=1, supported=False, reason="o texto não diz isso"),
    ]
    outcome = await run(rig, questions, verdicts)
    assert (outcome.accepted, outcome.unsupported) == (1, 1)
    assert len(items(rig)) == 1
    assert outcome.log[0]["reason"] == "unsupported: o texto não diz isso"


async def test_when_the_judge_stays_silent_the_questions_are_discarded(rig: Rig) -> None:
    outcome = await run(rig, [tf(rig)], verdicts=[])
    assert (outcome.accepted, outcome.unsupported) == (0, 1)
    assert items(rig) == []


async def test_questions_without_a_verifiable_source_skip_the_judge_entirely(rig: Rig) -> None:
    bad = tf(
        rig, source=SourceRef(chunk_id=rig.chunk.id, quote="uma citação inventada que não existe")
    )
    outcome = await run(rig, [bad])
    assert (outcome.accepted, outcome.no_source) == (0, 1)
    assert [c.model for c in rig.fake.calls] == ["vendor/gen"]


async def test_duplicate_statements_are_dropped_inside_and_across_batches(rig: Rig) -> None:
    first = await run(rig, [tf(rig), tf(rig, "  a MITOCÔNDRIA realiza a respiração celular. ")])
    assert (first.accepted, first.duplicate) == (1, 1)
    again = await run(rig, [tf(rig)])
    assert (again.accepted, again.duplicate) == (0, 1)


async def test_only_the_remaining_quota_is_stored(rig: Rig) -> None:
    questions = [tf(rig, f"Afirmação número {i} sobre a organela.") for i in range(4)]
    outcome = await run(rig, questions, remaining=2)
    assert outcome.accepted == 2
    assert len(items(rig)) == 2


@pytest.mark.parametrize(
    ("profile", "question", "reason"),
    [
        ("certo_errado", "tf-bad-answer", "bad_answer"),
        ("certo_errado", "mc", "wrong_subtype"),
        ("multiple_choice_4", "tf", "wrong_subtype"),
        ("multiple_choice_4", "mc5", "wrong_option_count"),
        ("multiple_choice_5", "mc", "wrong_option_count"),
        ("multiple_choice_4", "mc-bad-answer", "bad_answer"),
        ("multiple_choice_4", "mc-empty-why", "empty_option"),
        ("multiple_choice_4", "mc-same-text", "duplicate_options"),
        ("multiple_choice_4", "mc-bad-keys", "bad_option_keys"),
        ("certo_errado", "tf-empty-statement", "empty_statement"),
        ("certo_errado", "tf-empty-explanation", "empty_explanation"),
    ],
)
def test_question_problem_names_what_is_wrong(
    rig: Rig, profile: str, question: str, reason: str
) -> None:
    built = {
        "tf": tf(rig),
        "tf-bad-answer": tf(rig, answer="X"),
        "tf-empty-statement": tf(rig, statement="  "),
        "tf-empty-explanation": tf(rig, explanation=""),
        "mc": mc(rig),
        "mc5": mc(rig, 5),
        "mc-bad-answer": mc(rig, answer="Z"),
        "mc-empty-why": mc(
            rig,
            options=[OptionOut(key=k, text=f"t{k}", why="" if k == "B" else "w") for k in "ABCD"],
        ),
        "mc-same-text": mc(rig, options=[OptionOut(key=k, text="igual", why="w") for k in "ABCD"]),
        "mc-bad-keys": mc(rig, options=[OptionOut(key=k, text=f"t{k}", why="w") for k in "BCDE"]),
    }[question]
    assert question_problem(built, profile) == reason


def test_valid_questions_have_no_problem_and_payload_matches(rig: Rig) -> None:
    assert question_problem(tf(rig), "certo_errado") is None
    assert question_problem(mc(rig), "multiple_choice_4") is None
    assert question_problem(mc(rig, 5), "multiple_choice_5") is None
    payload = payload_for(mc(rig))
    assert payload.answer == "A"
    assert len(payload.options) == 4
