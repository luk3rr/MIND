# Filename: test_judge.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from mind.generation.judge import Judge
from mind.generation.prompts import JudgeItem
from mind.generation.schemas import JudgeBatch, Verdict
from mind.llm.types import Usage
from tests.generation.conftest import Rig

ITEMS = [
    JudgeItem("Texto 1.", "Afirmação 1?", [], "C"),
    JudgeItem("Texto 2.", "Afirmação 2?", [], "E"),
    JudgeItem("Texto 3.", "Afirmação 3?", [], "C"),
]


async def test_each_verdict_is_matched_by_its_index_and_the_cost_is_reported(rig: Rig) -> None:
    rig.fake.usage = Usage(prompt_tokens=10, completion_tokens=10, cost_usd=0.02)
    rig.fake.script(
        JudgeBatch,
        JudgeBatch(
            verdicts=[
                Verdict(index=2, supported=True, reason="no texto"),
                Verdict(index=0, supported=False, reason="ambígua"),
                Verdict(index=1, supported=True),
            ]
        ),
    )
    result = await Judge(rig.guarded).judge(ITEMS, "vendor/judge")
    assert result.supported == [False, True, True]
    assert result.reasons == ["ambígua", "supported", "no texto"]
    assert result.cost_usd == 0.02
    assert rig.fake.calls[0].model == "vendor/judge"
    assert "[question 2]" in rig.fake.calls[0].messages[1].content


async def test_missing_repeated_or_out_of_range_verdicts_count_against_the_question(
    rig: Rig,
) -> None:
    rig.fake.script(
        JudgeBatch,
        JudgeBatch(
            verdicts=[
                Verdict(index=0, supported=True),
                Verdict(index=0, supported=False, reason="late repeat"),
                Verdict(index=9, supported=True),
                Verdict(index=-1, supported=True),
            ]
        ),
    )
    result = await Judge(rig.guarded).judge(ITEMS, "vendor/judge")
    assert result.supported == [True, False, False]
    assert result.reasons[1:] == ["no_verdict", "no_verdict"]


async def test_nothing_to_judge_means_no_model_call(rig: Rig) -> None:
    result = await Judge(rig.guarded).judge([], "vendor/judge")
    assert (result.supported, result.cost_usd) == ([], 0.0)
    assert rig.fake.calls == []
