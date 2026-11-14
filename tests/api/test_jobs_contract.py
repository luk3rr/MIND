# Filename: test_jobs_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import asyncio
import json
import threading
import time
from typing import Any

from fastapi.testclient import TestClient

from mind.jobs import store
from mind.jobs.queue import JobContext, JobQueue
from mind.workspaces.registry import WorkspaceRegistry


def make_workspace(client: TestClient) -> int:
    return int(client.post("/api/v1/workspaces", json={"name": "Jobs"}).json()["id"])


def registry_of(client: TestClient) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = client.app.state.registry  # type: ignore[attr-defined]
    return registry


def queue_of(client: TestClient) -> JobQueue:
    queue: JobQueue = client.app.state.queue  # type: ignore[attr-defined]
    return queue


def test_list_and_get_jobs(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    assert client.get(f"/api/v1/workspaces/{workspace_id}/jobs").json() == []

    sessions = registry_of(client).open(workspace_id).sessions
    job = store.create_job(sessions, "demo")
    store.set_state(sessions, job.id, "done")

    listed = client.get(f"/api/v1/workspaces/{workspace_id}/jobs").json()
    assert [j["id"] for j in listed] == [job.id]
    one = client.get(f"/api/v1/workspaces/{workspace_id}/jobs/{job.id}").json()
    assert (one["state"], one["progress"]) == ("done", 1.0)


def test_unknown_job_and_workspace_are_404_problems(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    missing_job = client.get(f"/api/v1/workspaces/{workspace_id}/jobs/77")
    assert (missing_job.status_code, missing_job.json()["code"]) == (404, "JOB_NOT_FOUND")
    missing_ws = client.get("/api/v1/workspaces/55/jobs")
    assert missing_ws.json()["code"] == "WORKSPACE_NOT_FOUND"


def test_cancelling_a_finished_job_conflicts(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    sessions = registry_of(client).open(workspace_id).sessions
    job = store.create_job(sessions, "demo")
    store.set_state(sessions, job.id, "done")

    response = client.post(f"/api/v1/workspaces/{workspace_id}/jobs/{job.id}/cancel")
    assert response.status_code == 409
    assert response.json()["code"] == "JOB_NOT_ACTIVE"


def test_cancelling_a_running_job(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    sessions = registry_of(client).open(workspace_id).sessions
    queue = queue_of(client)
    started = asyncio.Event()

    async def submit() -> int:
        async def work(ctx: JobContext) -> None:
            started.set()
            while True:
                ctx.check_cancelled()
                await asyncio.sleep(0.01)

        info = queue.submit(workspace_id, sessions, "demo", work)
        await started.wait()
        return info.id

    assert client.portal is not None
    job_id: int = client.portal.call(submit)

    response = client.post(f"/api/v1/workspaces/{workspace_id}/jobs/{job_id}/cancel")
    assert response.status_code == 202

    async def finish() -> None:
        await queue.wait(workspace_id, job_id)

    client.portal.call(finish)
    state = client.get(f"/api/v1/workspaces/{workspace_id}/jobs/{job_id}").json()["state"]
    assert state == "cancelled"


def parse_events(text: str) -> list[tuple[str, dict[str, Any]]]:
    events: list[tuple[str, dict[str, Any]]] = []
    for block in filter(None, text.split("\n\n")):
        name, data = block.split("\n", 1)
        events.append((name.removeprefix("event: "), json.loads(data[6:])))
    return events


def test_event_stream_ends_with_the_terminal_event(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    sessions = registry_of(client).open(workspace_id).sessions
    job = store.create_job(sessions, "demo")
    store.set_state(sessions, job.id, "failed", error_code="BOOM", error_detail="x")

    response = client.get(f"/api/v1/workspaces/{workspace_id}/jobs/{job.id}/events")
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_events(response.text)
    assert events[-1][0] == "failed"
    assert events[-1][1]["code"] == "BOOM"
    assert events[-1][1]["job_id"] == job.id


def test_event_stream_reports_progress_before_finishing(client: TestClient) -> None:
    workspace_id = make_workspace(client)
    sessions = registry_of(client).open(workspace_id).sessions
    job = store.create_job(sessions, "demo")
    store.set_state(sessions, job.id, "running")
    store.set_progress(sessions, job.id, 0.5, "halfway")

    def finish_later() -> None:
        time.sleep(0.3)
        store.set_state(sessions, job.id, "done")

    thread = threading.Thread(target=finish_later)
    thread.start()
    response = client.get(f"/api/v1/workspaces/{workspace_id}/jobs/{job.id}/events")
    thread.join()

    events = parse_events(response.text)
    assert events[0][0] == "progress"
    assert events[0][1]["progress"] == 0.5
    assert events[-1][0] == "done"
    assert events[-1][1]["progress"] == 1.0
