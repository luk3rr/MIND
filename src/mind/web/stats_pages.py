# Filename: stats_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages of the statistics and the topic management."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.errors import ValidationFailed
from mind.web.charts import activity_bars, retention_points
from mind.web.rendering import Registry, StatsDep, StudyDep, render

router = APIRouter(prefix="/w/{workspace_id}/stats")

PERIOD_DAYS = 30


def _context(workspace_id: int, stats: StatsDep, study: StudyDep) -> dict[str, Any]:
    service = stats.stats(workspace_id)
    summary = service.summary()
    retention = service.retention(PERIOD_DAYS)
    activity = service.activity(PERIOD_DAYS)
    return {
        "workspace_id": workspace_id,
        "summary": summary,
        "topic_stats": service.topic_stats(),
        "weak_topics": service.weakest_topics(3),
        "topics": stats.topics(workspace_id).list_topics(),
        "retention": retention,
        "retention_points": retention_points(retention.days),
        "activity": activity,
        "bars": activity_bars(activity),
        "study_settings": study.for_workspace(workspace_id).settings(),
        "period_days": PERIOD_DAYS,
    }


@router.get("", response_class=HTMLResponse)
async def stats_page(
    request: Request, workspace_id: int, registry: Registry, stats: StatsDep, study: StudyDep
) -> HTMLResponse:
    info = registry.get(workspace_id)
    return render(
        request,
        "stats.html",
        workspace=info,
        active="stats",
        **_context(workspace_id, stats, study),
    )


@router.post("/goal", response_model=None)
async def save_goal(
    request: Request,
    workspace_id: int,
    registry: Registry,
    stats: StatsDep,
    study: StudyDep,
    daily_goal: Annotated[int, Form()],
    new_per_day: Annotated[int, Form()],
) -> Response:
    info = registry.get(workspace_id)
    try:
        study.for_workspace(workspace_id).update_settings(
            daily_goal=daily_goal, new_per_day=new_per_day
        )
    except ValidationFailed as exc:
        return render(
            request,
            "stats.html",
            status_code=exc.status,
            workspace=info,
            active="stats",
            form_error=exc.detail + " " + " ".join(e.message for e in exc.errors),
            **_context(workspace_id, stats, study),
        )
    return RedirectResponse(f"/w/{workspace_id}/stats", status_code=303)


def _back(workspace_id: int) -> RedirectResponse:
    return RedirectResponse(f"/w/{workspace_id}/stats#topics", status_code=303)


@router.post("/topics/{topic_id}/rename", response_model=None)
async def rename_topic(
    workspace_id: int,
    topic_id: int,
    registry: Registry,
    stats: StatsDep,
    name: Annotated[str, Form()] = "",
) -> Response:
    registry.get(workspace_id)
    stats.topics(workspace_id).rename(topic_id, name)
    return _back(workspace_id)


@router.post("/topics/{topic_id}/merge", response_model=None)
async def merge_topic(
    workspace_id: int,
    topic_id: int,
    registry: Registry,
    stats: StatsDep,
    target: Annotated[int, Form()],
) -> Response:
    registry.get(workspace_id)
    stats.topics(workspace_id).merge(topic_id, target)
    return _back(workspace_id)


@router.post("/topics/{topic_id}/delete", response_model=None)
async def delete_topic(
    workspace_id: int, topic_id: int, registry: Registry, stats: StatsDep
) -> Response:
    registry.get(workspace_id)
    stats.topics(workspace_id).delete(topic_id)
    return _back(workspace_id)
