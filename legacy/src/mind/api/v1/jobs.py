# Filename: jobs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Job resource of the v1 API: list, get, cancel and stream progress (SSE)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from mind.api.deps import Queue, Registry
from mind.api.schemas import JobOut, Problem
from mind.errors import JobNotActive
from mind.jobs import store
from mind.jobs.store import JobInfo

router = APIRouter(prefix="/workspaces/{workspace_id}/jobs", tags=["jobs"])

NOT_FOUND: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or job not found."}
}
TERMINAL_STATES = {"done", "failed", "cancelled"}


def to_out(info: JobInfo) -> JobOut:
    return JobOut(**info.__dict__)


@router.get("", response_model=list[JobOut], responses=NOT_FOUND, summary="List jobs")
async def list_jobs(workspace_id: int, registry: Registry) -> list[JobOut]:
    workspace = registry.open(workspace_id)
    return [to_out(job) for job in store.list_jobs(workspace.sessions)]


@router.get("/{job_id}", response_model=JobOut, responses=NOT_FOUND, summary="Get a job")
async def get_job(workspace_id: int, job_id: int, registry: Registry) -> JobOut:
    workspace = registry.open(workspace_id)
    return to_out(store.get_job(workspace.sessions, job_id))


@router.post(
    "/{job_id}/cancel",
    response_model=JobOut,
    status_code=202,
    responses={**NOT_FOUND, 409: {"model": Problem, "description": "Job is not running."}},
    summary="Request cancellation of a job",
)
async def cancel_job(workspace_id: int, job_id: int, registry: Registry, queue: Queue) -> JobOut:
    workspace = registry.open(workspace_id)
    current = store.get_job(workspace.sessions, job_id)
    if not queue.cancel(workspace_id, job_id):
        raise JobNotActive(f"A tarefa {job_id} está no estado '{current.state}'.")
    return to_out(store.get_job(workspace.sessions, job_id))


def sse(event: str, info: JobInfo) -> str:
    payload = {
        "job_id": info.id,
        "state": info.state,
        "progress": info.progress,
        "message": info.message,
        "code": info.error_code,
    }
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


@router.get(
    "/{job_id}/events",
    responses={**NOT_FOUND, 200: {"content": {"text/event-stream": {}}}},
    summary="Stream job progress as server-sent events",
)
async def job_events(
    workspace_id: int, job_id: int, registry: Registry, poll_interval: float = 0.25
) -> StreamingResponse:
    workspace = registry.open(workspace_id)
    store.get_job(workspace.sessions, job_id)  # 404 before the stream starts

    async def stream() -> AsyncIterator[str]:
        last: tuple[str, float, str] | None = None
        while True:
            info = store.get_job(workspace.sessions, job_id)
            if info.state in TERMINAL_STATES:
                yield sse(info.state, info)
                return
            snapshot = (info.state, info.progress, info.message)
            if snapshot != last:
                last = snapshot
                yield sse("progress", info)
            await asyncio.sleep(poll_interval)

    return StreamingResponse(stream(), media_type="text/event-stream")
