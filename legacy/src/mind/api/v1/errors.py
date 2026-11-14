# Filename: errors.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Error notebook resources of the v1 API."""

from __future__ import annotations

from fastapi import APIRouter

from mind.api.deps import NotebookDep, Registry
from mind.api.schemas import ErrorCardOut, ErrorCountsOut, ErrorEntryOut, ErrorNotebookOut, Problem

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["errors"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or question not found."},
    422: {"model": Problem, "description": "The question was not answered wrongly."},
}


@router.post(
    "/items/{item_id}/error-card",
    response_model=ErrorCardOut,
    responses=ERRORS,
    summary="Turn a question answered wrongly into a card (once)",
)
async def make_error_card(
    workspace_id: int, item_id: int, notebook: NotebookDep, registry: Registry
) -> ErrorCardOut:
    registry.get(workspace_id)
    result = notebook.for_workspace(workspace_id).create_card(item_id)
    return ErrorCardOut(item_id=result.item_id, created=result.created)


@router.get(
    "/errors",
    response_model=ErrorNotebookOut,
    responses=ERRORS,
    summary="Cards made from mistakes and cards rated Errei",
)
async def error_notebook(
    workspace_id: int,
    notebook: NotebookDep,
    registry: Registry,
    topic_id: int | None = None,
) -> ErrorNotebookOut:
    registry.get(workspace_id)
    service = notebook.for_workspace(workspace_id)
    counts = service.counts()
    return ErrorNotebookOut(
        counts=ErrorCountsOut(**counts.__dict__),
        entries=[ErrorEntryOut(**e.__dict__) for e in service.entries(topic_id)],
    )
