# Filename: topics.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Topic resources of the v1 API."""

from __future__ import annotations

from fastapi import APIRouter, Response

from mind.api.deps import Registry, StatsDep
from mind.api.schemas import Problem, TopicMerge, TopicOut, TopicRename
from mind.stats.topics import TopicInfo

router = APIRouter(prefix="/workspaces/{workspace_id}/topics", tags=["topics"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or topic not found."},
    422: {"model": Problem, "description": "Invalid name or merge."},
}


def to_out(info: TopicInfo) -> TopicOut:
    return TopicOut(id=info.id, name=info.name, cards=info.cards, questions=info.questions)


@router.get("", response_model=list[TopicOut], responses=ERRORS, summary="List topics")
async def list_topics(workspace_id: int, stats: StatsDep, registry: Registry) -> list[TopicOut]:
    registry.get(workspace_id)
    return [to_out(t) for t in stats.topics(workspace_id).list_topics()]


@router.patch("/{topic_id}", response_model=TopicOut, responses=ERRORS, summary="Rename a topic")
async def rename(
    workspace_id: int, topic_id: int, body: TopicRename, stats: StatsDep, registry: Registry
) -> TopicOut:
    registry.get(workspace_id)
    return to_out(stats.topics(workspace_id).rename(topic_id, body.name))


@router.post(
    "/{topic_id}/merge",
    response_model=TopicOut,
    responses=ERRORS,
    summary="Merge this topic into another and remove it",
)
async def merge(
    workspace_id: int, topic_id: int, body: TopicMerge, stats: StatsDep, registry: Registry
) -> TopicOut:
    registry.get(workspace_id)
    return to_out(stats.topics(workspace_id).merge(topic_id, body.target_id))


@router.delete(
    "/{topic_id}",
    status_code=204,
    responses=ERRORS,
    summary="Delete a topic; its items stay without a topic",
)
async def delete(workspace_id: int, topic_id: int, stats: StatsDep, registry: Registry) -> Response:
    registry.get(workspace_id)
    stats.topics(workspace_id).delete(topic_id)
    return Response(status_code=204)
