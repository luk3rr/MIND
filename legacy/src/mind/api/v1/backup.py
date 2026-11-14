# Filename: backup.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Export and import of workspaces as `.zip` backups."""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from mind.api.deps import Registry
from mind.api.schemas import Problem, WorkspaceOut
from mind.workspaces.archive import download_name, export_to_temp, import_upload

router = APIRouter(prefix="/workspaces", tags=["backup"])


@router.get(
    "/{workspace_id}/export",
    response_class=FileResponse,
    responses={404: {"model": Problem, "description": "Workspace not found."}},
    summary="Download a backup (.zip) of the workspace: data and original files, no API key",
)
async def export(workspace_id: int, registry: Registry) -> FileResponse:
    info = registry.get(workspace_id)
    path = await asyncio.to_thread(export_to_temp, registry, workspace_id)
    return FileResponse(
        path,
        media_type="application/zip",
        filename=download_name(info),
        background=BackgroundTask(path.unlink, missing_ok=True),
    )


@router.post(
    "/import",
    response_model=WorkspaceOut,
    status_code=201,
    responses={422: {"model": Problem, "description": "Invalid or incompatible backup."}},
    summary="Create a new workspace from a backup (.zip)",
)
async def import_backup(
    registry: Registry, file: Annotated[UploadFile, File(description="A MIND backup.")]
) -> WorkspaceOut:
    info = await asyncio.to_thread(import_upload, registry, file.file)
    return WorkspaceOut(id=info.id, name=info.name, created_at=info.created_at)
