# Filename: practice.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Question practice resources of the v1 API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from mind.api.deps import PracticeDep, Registry
from mind.api.schemas import (
    AnswerIn,
    AnswerOut,
    ItemOptionOut,
    PracticeOptionOut,
    PracticeQuestionOut,
    PracticeSummaryOut,
    Problem,
)
from mind.practice.service import PracticeQuestion
from mind.study.service import StudyFilter

router = APIRouter(prefix="/workspaces/{workspace_id}/practice", tags=["practice"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or question not found."},
    422: {"model": Problem, "description": "Invalid answer."},
}


def selection(
    topic_id: int | None = None,
    material_id: int | None = None,
    subtype: Annotated[str | None, Query(pattern="^(certo_errado|multiple_choice)$")] = None,
) -> StudyFilter:
    return StudyFilter(kind="question", topic_id=topic_id, material_id=material_id, subtype=subtype)


Selection = Annotated[StudyFilter, Depends(selection)]


def question_out(question: PracticeQuestion) -> PracticeQuestionOut:
    item = question.item
    return PracticeQuestionOut(
        id=item.id,
        subtype=item.subtype,
        statement=item.front,
        options=[PracticeOptionOut(key=o["key"], text=o["text"]) for o in item.options],
        topic=item.topic,
        attempts=question.attempts,
        last_correct=question.last_correct,
    )


@router.get(
    "/queue",
    response_model=list[PracticeQuestionOut],
    responses=ERRORS,
    summary="Questions to practise: never answered first, then the ones answered wrongly",
)
async def queue(
    workspace_id: int,
    practice: PracticeDep,
    registry: Registry,
    chosen: Selection,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    redo: bool = False,
) -> list[PracticeQuestionOut]:
    registry.get(workspace_id)
    service = practice.for_workspace(workspace_id)
    return [question_out(q) for q in service.queue(limit, chosen, redo=redo)]


@router.post(
    "/answers",
    response_model=AnswerOut,
    responses=ERRORS,
    summary="Answer a question and get the correct key, the reasons and the comment",
)
async def answer(
    workspace_id: int, body: AnswerIn, practice: PracticeDep, registry: Registry
) -> AnswerOut:
    registry.get(workspace_id)
    result = practice.for_workspace(workspace_id).answer(
        body.item_id, body.answer, seconds=body.duration_seconds
    )
    return AnswerOut(
        correct=result.correct,
        answer=result.answer,
        correct_key=result.correct_key,
        explanation=result.explanation,
        options=[ItemOptionOut(**o) for o in result.options],
        attempt_id=result.attempt_id,
    )


@router.get(
    "/summary", response_model=PracticeSummaryOut, responses=ERRORS, summary="Practice numbers"
)
async def summary(
    workspace_id: int, practice: PracticeDep, registry: Registry, chosen: Selection
) -> PracticeSummaryOut:
    registry.get(workspace_id)
    counts = practice.for_workspace(workspace_id).counts(chosen)
    return PracticeSummaryOut(
        unseen=counts.unseen,
        retry=counts.retry,
        to_practice=counts.to_practice,
        answered_today=counts.answered_today,
        correct_today=counts.correct_today,
    )
