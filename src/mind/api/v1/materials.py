# Filename: materials.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Material resources of the v1 API: import, list, chunks and search."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile

from mind.api.deps import MaterialsDep, Registry
from mind.api.schemas import ChunkOut, MaterialOut, Problem, SearchHitOut
from mind.ingestion.service import MaterialInfo
from mind.retrieval.retriever import Bm25Retriever

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["materials"])

NOT_FOUND: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or material not found."}
}


def to_out(info: MaterialInfo) -> MaterialOut:
    return MaterialOut(**info.__dict__)


@router.post(
    "/materials",
    response_model=MaterialOut,
    status_code=202,
    responses={
        **NOT_FOUND,
        415: {"model": Problem, "description": "Unsupported format or file too large."},
    },
    summary="Import a material (PDF, Markdown or text)",
)
async def import_material(
    workspace_id: int,
    materials: MaterialsDep,
    registry: Registry,
    file: Annotated[UploadFile, File(description="PDF, Markdown or text file.")],
) -> MaterialOut:
    registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    return to_out(service.import_file(file.filename or "", file.file))


@router.get(
    "/materials",
    response_model=list[MaterialOut],
    responses=NOT_FOUND,
    summary="List materials, newest first",
)
async def list_materials(
    workspace_id: int, materials: MaterialsDep, registry: Registry
) -> list[MaterialOut]:
    registry.get(workspace_id)
    return [to_out(m) for m in materials.for_workspace(workspace_id).list_materials()]


@router.get(
    "/materials/{material_id}",
    response_model=MaterialOut,
    responses=NOT_FOUND,
    summary="Get a material",
)
async def get_material(
    workspace_id: int, material_id: int, materials: MaterialsDep, registry: Registry
) -> MaterialOut:
    registry.get(workspace_id)
    return to_out(materials.for_workspace(workspace_id).get(material_id))


@router.delete(
    "/materials/{material_id}",
    status_code=204,
    responses=NOT_FOUND,
    summary="Delete a material with its chunks and files",
)
async def delete_material(
    workspace_id: int, material_id: int, materials: MaterialsDep, registry: Registry
) -> Response:
    registry.get(workspace_id)
    materials.for_workspace(workspace_id).delete(material_id)
    return Response(status_code=204)


@router.get(
    "/materials/{material_id}/chunks",
    response_model=list[ChunkOut],
    responses=NOT_FOUND,
    summary="List the chunks of a material in reading order",
)
async def list_chunks(
    workspace_id: int,
    material_id: int,
    materials: MaterialsDep,
    registry: Registry,
    page: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ChunkOut]:
    registry.get(workspace_id)
    service = materials.for_workspace(workspace_id)
    chunks = service.chunks(material_id, page=page, offset=offset, limit=limit)
    return [ChunkOut(**chunk.__dict__) for chunk in chunks]


@router.get(
    "/search",
    response_model=list[SearchHitOut],
    responses=NOT_FOUND,
    summary="Search the chunks of the workspace (BM25)",
)
async def search(
    workspace_id: int,
    registry: Registry,
    q: Annotated[str, Query(min_length=1, description="Search terms.")],
    material_id: Annotated[list[int] | None, Query()] = None,
    page_from: Annotated[int | None, Query(ge=1)] = None,
    page_to: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[SearchHitOut]:
    workspace = registry.open(workspace_id)
    hits = Bm25Retriever(workspace.sessions).search(
        q, material_ids=material_id, page_from=page_from, page_to=page_to, limit=limit
    )
    return [SearchHitOut(**hit.__dict__) for hit in hits]
