# Filename: generate_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages to start card generation and follow its runs."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.errors import AppError
from mind.generation.schemas import CARD_SUBTYPES
from mind.generation.service import GenerationRequest, GenerationService
from mind.review.service import ReviewService
from mind.web.rendering import (
    GenerationDep,
    MaterialsDep,
    Registry,
    ReviewDep,
    ServicesDep,
    render,
)

router = APIRouter(prefix="/w/{workspace_id}/generate")

ACTIVE = ("queued", "running")


def _optional_int(value: str) -> int | None:
    value = value.strip()
    return int(value) if value.lstrip("-").isdigit() else None


def _build_request(
    material_id: int, page_from: str, page_to: str, subtype: str, quantity: int
) -> GenerationRequest:
    return GenerationRequest(
        material_id=material_id,
        subtype=subtype,
        quantity=quantity,
        page_from=_optional_int(page_from),
        page_to=_optional_int(page_to),
    )


def _runs_context(
    workspace_id: int,
    generation: GenerationService,
    review: ReviewService,
    titles: dict[int, str],
) -> dict[str, Any]:
    runs = generation.list_runs()
    return {
        "runs": runs,
        "drafts": {r.id: review.count(run_id=r.id, status="draft") for r in runs},
        "titles": titles,
        "any_active": any(r.status in ACTIVE for r in runs),
        "workspace_id": workspace_id,
    }


def _page_context(
    workspace_id: int,
    generation: GenerationService,
    review: ReviewService,
    materials: MaterialsDep,
    services: ServicesDep,
) -> dict[str, Any]:
    all_materials = materials.for_workspace(workspace_id).list_materials()
    titles = {m.id: m.title for m in all_materials}
    ready_error: AppError | None = None
    try:
        services.ensure_ready()
    except AppError as exc:
        ready_error = exc
    return {
        "indexed": [m for m in all_materials if m.status == "indexed"],
        "subtypes": CARD_SUBTYPES,
        "ready_error": ready_error,
        "defaults": {"quantity": 20, "subtype": "qa"},
        **_runs_context(workspace_id, generation, review, titles),
    }


@router.get("", response_class=HTMLResponse)
async def generate_page(
    request: Request,
    workspace_id: int,
    registry: Registry,
    generation: GenerationDep,
    review: ReviewDep,
    materials: MaterialsDep,
    services: ServicesDep,
) -> HTMLResponse:
    info = registry.get(workspace_id)
    context = _page_context(
        workspace_id,
        generation.for_workspace(workspace_id),
        review.for_workspace(workspace_id),
        materials,
        services,
    )
    return render(request, "generate.html", workspace=info, active="generate", **context)


@router.get("/runs", response_class=HTMLResponse)
async def runs_partial(
    request: Request,
    workspace_id: int,
    registry: Registry,
    generation: GenerationDep,
    review: ReviewDep,
    materials: MaterialsDep,
) -> HTMLResponse:
    registry.get(workspace_id)
    titles = {m.id: m.title for m in materials.for_workspace(workspace_id).list_materials()}
    context = _runs_context(
        workspace_id,
        generation.for_workspace(workspace_id),
        review.for_workspace(workspace_id),
        titles,
    )
    return render(request, "_runs.html", **context)


@router.post("/estimate", response_class=HTMLResponse)
async def estimate(
    request: Request,
    workspace_id: int,
    registry: Registry,
    generation: GenerationDep,
    material_id: Annotated[int, Form()] = 0,
    page_from: Annotated[str, Form()] = "",
    page_to: Annotated[str, Form()] = "",
    subtype: Annotated[str, Form()] = "qa",
    quantity: Annotated[int, Form()] = 20,
) -> HTMLResponse:
    registry.get(workspace_id)
    try:
        info = generation.for_workspace(workspace_id).estimate(
            _build_request(material_id, page_from, page_to, subtype, quantity)
        )
    except AppError as exc:
        return render(request, "_estimate.html", estimate=None, estimate_error=exc.detail)
    return render(request, "_estimate.html", estimate=info, estimate_error=None)


@router.post("", response_model=None)
async def start(
    request: Request,
    workspace_id: int,
    registry: Registry,
    generation: GenerationDep,
    review: ReviewDep,
    materials: MaterialsDep,
    services: ServicesDep,
    material_id: Annotated[int, Form()] = 0,
    page_from: Annotated[str, Form()] = "",
    page_to: Annotated[str, Form()] = "",
    subtype: Annotated[str, Form()] = "qa",
    quantity: Annotated[int, Form()] = 20,
) -> Response:
    info = registry.get(workspace_id)
    service = generation.for_workspace(workspace_id)
    try:
        service.start(_build_request(material_id, page_from, page_to, subtype, quantity))
    except AppError as exc:
        context = _page_context(
            workspace_id, service, review.for_workspace(workspace_id), materials, services
        )
        return render(
            request,
            "generate.html",
            status_code=exc.status,
            workspace=info,
            active="generate",
            form_error=exc.detail or exc.title,
            **context,
        )
    return RedirectResponse(f"/w/{workspace_id}/generate", status_code=303)


@router.post("/{run_id}/cancel", response_model=None)
async def cancel(
    request: Request, workspace_id: int, run_id: int, registry: Registry, generation: GenerationDep
) -> Response:
    registry.get(workspace_id)
    run = generation.for_workspace(workspace_id).get(run_id)
    if run.job_id is not None:
        request.app.state.queue.cancel(workspace_id, run.job_id)
    return RedirectResponse(f"/w/{workspace_id}/generate", status_code=303)
