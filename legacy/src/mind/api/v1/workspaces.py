# Filename: workspaces.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Workspace resource of the v1 API."""

from __future__ import annotations

from fastapi import APIRouter, Response

from mind.api.deps import Registry
from mind.api.schemas import Problem, WorkspaceIn, WorkspaceOut
from mind.workspaces.registry import WorkspaceInfo

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace not found."},
    422: {"model": Problem, "description": "Invalid data."},
}


def to_out(info: WorkspaceInfo) -> WorkspaceOut:
    return WorkspaceOut(id=info.id, name=info.name, created_at=info.created_at)


@router.get("", response_model=list[WorkspaceOut], summary="List workspaces")
async def list_workspaces(registry: Registry) -> list[WorkspaceOut]:
    return [to_out(info) for info in registry.list()]


@router.post(
    "",
    response_model=WorkspaceOut,
    status_code=201,
    responses={422: ERRORS[422]},
    summary="Create a workspace",
)
async def create_workspace(body: WorkspaceIn, registry: Registry) -> WorkspaceOut:
    return to_out(registry.create(body.name))


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceOut,
    responses={404: ERRORS[404]},
    summary="Get a workspace",
)
async def get_workspace(workspace_id: int, registry: Registry) -> WorkspaceOut:
    return to_out(registry.get(workspace_id))


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceOut,
    responses=ERRORS,
    summary="Rename a workspace",
)
async def rename_workspace(
    workspace_id: int, body: WorkspaceIn, registry: Registry
) -> WorkspaceOut:
    return to_out(registry.rename(workspace_id, body.name))


@router.delete(
    "/{workspace_id}",
    status_code=204,
    responses={404: ERRORS[404]},
    summary="Delete a workspace and all its data",
)
async def delete_workspace(workspace_id: int, registry: Registry) -> Response:
    registry.delete(workspace_id)
    return Response(status_code=204)
