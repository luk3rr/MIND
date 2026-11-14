# Filename: stats.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Statistics resources of the v1 API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from mind.api.deps import Registry, StatsDep
from mind.api.schemas import (
    ActivityDayOut,
    Problem,
    RetentionDayOut,
    RetentionOut,
    StatsSummaryOut,
    TopicStatOut,
)
from mind.stats.service import TopicStat

router = APIRouter(prefix="/workspaces/{workspace_id}/stats", tags=["stats"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace not found."}
}
Days = Annotated[int, Query(ge=1, le=365, description="Number of study days, ending today.")]


def topic_out(s: TopicStat) -> TopicStatOut:
    return TopicStatOut(
        topic_id=s.topic_id,
        name=s.name,
        card_reviews=s.card_reviews,
        card_passes=s.card_passes,
        question_attempts=s.question_attempts,
        question_correct=s.question_correct,
        events=s.events,
        accuracy=s.accuracy,
        card_accuracy=s.card_accuracy,
        question_accuracy=s.question_accuracy,
        small_sample=s.small_sample,
    )


@router.get(
    "/summary", response_model=StatsSummaryOut, responses=ERRORS, summary="Today, goal and streaks"
)
async def summary(workspace_id: int, stats: StatsDep, registry: Registry) -> StatsSummaryOut:
    registry.get(workspace_id)
    found = stats.stats(workspace_id).summary()
    return StatsSummaryOut(**found.__dict__, goal_met=found.goal_met)


@router.get(
    "/topics",
    response_model=list[TopicStatOut],
    responses=ERRORS,
    summary="Accuracy by topic (cards and questions)",
)
async def by_topic(workspace_id: int, stats: StatsDep, registry: Registry) -> list[TopicStatOut]:
    registry.get(workspace_id)
    return [topic_out(s) for s in stats.stats(workspace_id).topic_stats()]


@router.get(
    "/weak-topics",
    response_model=list[TopicStatOut],
    responses=ERRORS,
    summary="Lowest-accuracy topics with enough events (candidates for training)",
)
async def weak_topics(
    workspace_id: int,
    stats: StatsDep,
    registry: Registry,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[TopicStatOut]:
    registry.get(workspace_id)
    return [topic_out(s) for s in stats.stats(workspace_id).weakest_topics(limit)]


@router.get("/retention", response_model=RetentionOut, responses=ERRORS, summary="Retention by day")
async def retention(
    workspace_id: int, stats: StatsDep, registry: Registry, days: Days = 30
) -> RetentionOut:
    registry.get(workspace_id)
    found = stats.stats(workspace_id).retention(days)
    return RetentionOut(
        days=[
            RetentionDayOut(day=d.day, reviews=d.reviews, passes=d.passes, rate=d.rate)
            for d in found.days
        ],
        reviews=found.reviews,
        rate=found.rate,
    )


@router.get(
    "/activity",
    response_model=list[ActivityDayOut],
    responses=ERRORS,
    summary="Reviews and answers per day",
)
async def activity(
    workspace_id: int, stats: StatsDep, registry: Registry, days: Days = 30
) -> list[ActivityDayOut]:
    registry.get(workspace_id)
    return [
        ActivityDayOut(day=a.day, reviews=a.reviews, attempts=a.attempts, total=a.total)
        for a in stats.stats(workspace_id).activity(days)
    ]
