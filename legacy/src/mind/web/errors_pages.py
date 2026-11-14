# Filename: errors_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages of the error notebook."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import HTMLResponse

from mind.web.rendering import NotebookDep, Registry, StatsDep, render

router = APIRouter(prefix="/w/{workspace_id}")


@router.get("/errors", response_class=HTMLResponse)
async def errors_page(
    request: Request,
    workspace_id: int,
    registry: Registry,
    notebook: NotebookDep,
    stats: StatsDep,
    topic: Annotated[str, Query()] = "",
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = notebook.for_workspace(workspace_id)
    topic_id = int(topic) if topic.isdigit() else None
    return render(
        request,
        "errors.html",
        workspace=info,
        active="errors",
        workspace_id=workspace_id,
        entries=service.entries(topic_id),
        counts=service.counts(),
        topics=stats.topics(workspace_id).list_topics(),
        selected_topic=topic_id,
    )


@router.post("/practice/error-card", response_class=HTMLResponse)
async def make_error_card(
    request: Request,
    workspace_id: int,
    registry: Registry,
    notebook: NotebookDep,
    item_id: Annotated[int, Form()],
) -> HTMLResponse:
    registry.get(workspace_id)
    result = notebook.for_workspace(workspace_id).create_card(item_id)
    return render(
        request,
        "_error_card_slot.html",
        workspace_id=workspace_id,
        created=result.created,
        exists=True,
        item_id=item_id,
    )
