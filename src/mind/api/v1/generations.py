# Filename: generations.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Generation resources of the v1 API: start, follow and estimate card generation."""

from __future__ import annotations

from fastapi import APIRouter

from mind.api.deps import GenerationDep, Registry
from mind.api.schemas import GenerationEstimateOut, GenerationIn, Problem, RunOut
from mind.generation.service import GenerationRequest, RunInfo

router = APIRouter(prefix="/workspaces/{workspace_id}/generations", tags=["generations"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace, material or generation not found."},
    422: {"model": Problem, "description": "Invalid request."},
}
NOT_READY: dict[int | str, dict[str, object]] = {
    409: {"model": Problem, "description": "No API key or consent."},
    402: {"model": Problem, "description": "Monthly cost limit reached."},
}


def to_out(info: RunInfo) -> RunOut:
    return RunOut(**{**info.__dict__, "discard_log": info.discard_log})


def to_request(body: GenerationIn) -> GenerationRequest:
    return GenerationRequest(
        material_id=body.material_id,
        subtype=body.subtype,
        quantity=body.quantity,
        page_from=body.page_from,
        page_to=body.page_to,
    )


@router.post(
    "",
    response_model=RunOut,
    status_code=202,
    responses={**ERRORS, **NOT_READY},
    summary="Start generating cards (returns the run and its job)",
)
async def start(
    workspace_id: int, body: GenerationIn, generation: GenerationDep, registry: Registry
) -> RunOut:
    registry.get(workspace_id)
    return to_out(generation.for_workspace(workspace_id).start(to_request(body)))


@router.post(
    "/estimate",
    response_model=GenerationEstimateOut,
    responses=ERRORS,
    summary="Estimate the cost of a generation without starting it",
)
async def estimate(
    workspace_id: int, body: GenerationIn, generation: GenerationDep, registry: Registry
) -> GenerationEstimateOut:
    registry.get(workspace_id)
    info = generation.for_workspace(workspace_id).estimate(to_request(body))
    return GenerationEstimateOut(**info.__dict__)


@router.get("", response_model=list[RunOut], responses=ERRORS, summary="List recent generations")
async def list_runs(
    workspace_id: int, generation: GenerationDep, registry: Registry
) -> list[RunOut]:
    registry.get(workspace_id)
    return [to_out(run) for run in generation.for_workspace(workspace_id).list_runs()]


@router.get("/{run_id}", response_model=RunOut, responses=ERRORS, summary="Get a generation")
async def get_run(
    workspace_id: int, run_id: int, generation: GenerationDep, registry: Registry
) -> RunOut:
    registry.get(workspace_id)
    return to_out(generation.for_workspace(workspace_id).get(run_id))
