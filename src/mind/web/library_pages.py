# Filename: library_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages of the library: list, import, preview and delete materials."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.errors import AppError
from mind.ingestion.service import MaterialInfo, MaterialService
from mind.jobs import store
from mind.web.rendering import MaterialsDep, Registry, render

router = APIRouter(prefix="/w/{workspace_id}/library")

ACTIVE = ("queued", "importing")
PREVIEW_PAGE_SIZE = 20


def _context(service: MaterialService, workspace_id: int, registry: Registry) -> dict[str, Any]:
    materials = service.list_materials()
    workspace = registry.open(workspace_id)
    progress = {
        m.id: store.get_job(workspace.sessions, m.job_id).progress
        for m in materials
        if m.status in ACTIVE and m.job_id is not None
    }
    return {
        "materials": materials,
        "progress": progress,
        "any_active": any(m.status in ACTIVE for m in materials),
        "workspace_id": workspace_id,
    }


@router.get("", response_class=HTMLResponse)
async def library(
    request: Request, workspace_id: int, registry: Registry, materials: MaterialsDep
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    return render(
        request,
        "library.html",
        workspace=info,
        active="library",
        **_context(service, workspace_id, registry),
    )


@router.get("/rows", response_class=HTMLResponse)
async def rows(
    request: Request, workspace_id: int, registry: Registry, materials: MaterialsDep
) -> HTMLResponse:
    registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    return render(request, "_library_rows.html", **_context(service, workspace_id, registry))


@router.post("/import", response_model=None)
async def import_material(
    request: Request,
    workspace_id: int,
    registry: Registry,
    materials: MaterialsDep,
    file: Annotated[UploadFile, File()],
) -> Response:
    info = registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    try:
        service.import_file(file.filename or "", file.file)
    except AppError as exc:
        return render(
            request,
            "library.html",
            status_code=exc.status,
            workspace=info,
            active="library",
            form_error=exc.detail,
            **_context(service, workspace_id, registry),
        )
    return RedirectResponse(f"/w/{workspace_id}/library", status_code=303)


@router.get("/{material_id}", response_class=HTMLResponse)
async def preview(
    request: Request,
    workspace_id: int,
    material_id: int,
    registry: Registry,
    materials: MaterialsDep,
    offset: int = 0,
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    material: MaterialInfo = service.get(material_id)
    offset = max(offset, 0)
    chunks = service.chunks(material_id, offset=offset, limit=PREVIEW_PAGE_SIZE)
    total = service.chunk_count(material_id)
    return render(
        request,
        "library_preview.html",
        workspace=info,
        active="library",
        material=material,
        chunks=chunks,
        offset=offset,
        previous_offset=max(offset - PREVIEW_PAGE_SIZE, 0) if offset > 0 else None,
        next_offset=offset + PREVIEW_PAGE_SIZE if offset + PREVIEW_PAGE_SIZE < total else None,
    )


@router.post("/{material_id}/delete", response_model=None)
async def delete_material(
    workspace_id: int, material_id: int, registry: Registry, materials: MaterialsDep
) -> Response:
    registry.get(workspace_id)
    materials.for_workspace(workspace_id).delete(material_id)
    return RedirectResponse(f"/w/{workspace_id}/library", status_code=303)
