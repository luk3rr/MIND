# Filename: test_question_prompts.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from pydantic import ValidationError

from mind.generation.prompts import (
    JUDGE_SYSTEM,
    PROFILE_RULES,
    JudgeItem,
    PromptChunk,
    build_judge_messages,
    build_question_messages,
)
from mind.generation.schemas import (
    PROFILES,
    JudgeBatch,
    QuestionBatch,
    QuestionOut,
    Verdict,
)

CHUNKS = [PromptChunk(id=4, label="Aula p.2", text="A mitocôndria produz ATP.")]


def test_profiles_define_the_type_and_the_number_of_options() -> None:
    assert {name: (p.subtype, p.options) for name, p in PROFILES.items()} == {
        "certo_errado": ("certo_errado", 2),
        "multiple_choice_4": ("multiple_choice", 4),
        "multiple_choice_5": ("multiple_choice", 5),
    }
    assert set(PROFILE_RULES) == set(PROFILES)


@pytest.mark.parametrize("profile", sorted(PROFILES))
def test_question_prompts_carry_the_rules_and_the_excerpts(profile: str) -> None:
    system, user = build_question_messages(profile, 3, CHUNKS)
    assert (system.role, user.role) == ("system", "user")
    assert "pt-BR" in system.content
    assert "VERBATIM" in system.content
    assert "ONLY information" in system.content
    assert "Create exactly 3 questions" in user.content
    assert PROFILE_RULES[profile] in user.content
    assert "[excerpt 4 | Aula p.2]\nA mitocôndria produz ATP." in user.content


def test_multiple_choice_rules_state_the_option_count_and_balance_is_requested() -> None:
    assert "exactly 4 options" in PROFILE_RULES["multiple_choice_4"]
    assert "exactly 5 options" in PROFILE_RULES["multiple_choice_5"]
    assert "half" in PROFILE_RULES["certo_errado"]


def test_judge_prompt_lists_each_question_with_its_excerpt_and_answer() -> None:
    items = [
        JudgeItem("Texto A.", "Afirmação A?", [], "C"),
        JudgeItem("Texto B.", "Pergunta B?", [("A", "um"), ("B", "dois")], "B"),
    ]
    system, user = build_judge_messages(items)
    assert system.content == JUDGE_SYSTEM
    assert "[question 0]" in user.content
    assert "[question 1]" in user.content
    assert "Proposed answer: B" in user.content
    assert "(certo/errado)" in user.content
    assert "  A) um" in user.content
    assert "When in doubt" in system.content


def test_question_schema_defaults_and_validation() -> None:
    raw = {
        "subtype": "certo_errado",
        "statement": "A mitocôndria produz ATP.",
        "answer": "C",
        "explanation": "Está no texto.",
        "source": {"chunk_id": 1, "quote": "A mitocôndria produz ATP."},
    }
    question = QuestionOut.model_validate(raw)
    assert question.options == []
    assert question.topic is None
    assert QuestionBatch.model_validate({"questions": [raw]}).questions[0].answer == "C"
    with pytest.raises(ValidationError):
        QuestionOut.model_validate({**raw, "subtype": "essay"})
    with pytest.raises(ValidationError):
        QuestionOut.model_validate({k: v for k, v in raw.items() if k != "answer"})


def test_verdicts_parse_and_default_the_reason() -> None:
    batch = JudgeBatch.model_validate({"verdicts": [{"index": 0, "supported": True}]})
    assert batch.verdicts == [Verdict(index=0, supported=True, reason="")]
