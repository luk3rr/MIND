# Filename: test_jobs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest

from mind.config import Settings
from mind.errors import JobNotFound, ValidationFailed
from mind.jobs import store
from mind.jobs.queue import JobContext, JobQueue
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry


@pytest.fixture
def workspace(tmp_path: Path) -> Iterator[OpenWorkspace]:
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
    yield registry.open(registry.create("Teste").id)
    registry.close()


async def test_job_runs_to_done_with_progress(workspace: OpenWorkspace) -> None:
    queue = JobQueue(progress_interval=0)

    async def work(ctx: JobContext) -> None:
        ctx.update(0.5, "halfway")

    info = queue.submit(1, workspace.sessions, "demo", work)
    assert info.state == "queued"
    await queue.wait(1, info.id)
    done = store.get_job(workspace.sessions, info.id)
    assert done.state == "done"
    assert done.progress == 1.0
    assert done.started_at is not None
    assert done.finished_at is not None
    assert done.started_at.tzinfo is not None
    assert done.finished_at >= done.started_at


async def test_app_error_marks_failed_with_stable_code(workspace: OpenWorkspace) -> None:
    queue = JobQueue()

    async def work(_ctx: JobContext) -> None:
        raise ValidationFailed("bad file")

    info = queue.submit(1, workspace.sessions, "demo", work)
    await queue.wait(1, info.id)
    failed = store.get_job(workspace.sessions, info.id)
    assert (failed.state, failed.error_code, failed.error_detail) == (
        "failed",
        "VALIDATION_ERROR",
        "bad file",
    )


async def test_unexpected_error_marks_failed_internal(workspace: OpenWorkspace) -> None:
    queue = JobQueue()

    async def work(_ctx: JobContext) -> None:
        raise RuntimeError("boom")

    info = queue.submit(1, workspace.sessions, "demo", work)
    await queue.wait(1, info.id)
    failed = store.get_job(workspace.sessions, info.id)
    assert (failed.state, failed.error_code, failed.error_detail) == (
        "failed",
        "INTERNAL_ERROR",
        "boom",
    )


async def test_cooperative_cancel_of_running_job(workspace: OpenWorkspace) -> None:
    queue = JobQueue()
    started = asyncio.Event()

    async def work(ctx: JobContext) -> None:
        started.set()
        while True:
            ctx.check_cancelled()
            await asyncio.sleep(0.01)

    info = queue.submit(1, workspace.sessions, "demo", work)
    await started.wait()
    assert queue.cancel(1, info.id) is True
    await queue.wait(1, info.id)
    assert store.get_job(workspace.sessions, info.id).state == "cancelled"
    assert queue.cancel(1, info.id) is False


async def test_concurrency_limit_keeps_second_job_queued(workspace: OpenWorkspace) -> None:
    queue = JobQueue(max_concurrent=1)
    release = asyncio.Event()
    first_started = asyncio.Event()

    async def first(_ctx: JobContext) -> None:
        first_started.set()
        await release.wait()

    async def second(_ctx: JobContext) -> None:
        return None

    a = queue.submit(1, workspace.sessions, "demo", first)
    b = queue.submit(1, workspace.sessions, "demo", second)
    await first_started.wait()
    await asyncio.sleep(0.05)
    assert store.get_job(workspace.sessions, a.id).state == "running"
    assert store.get_job(workspace.sessions, b.id).state == "queued"
    release.set()
    await queue.wait(1, a.id)
    await queue.wait(1, b.id)
    assert store.get_job(workspace.sessions, b.id).state == "done"


async def test_cancel_before_start_never_runs(workspace: OpenWorkspace) -> None:
    queue = JobQueue(max_concurrent=1)
    release = asyncio.Event()
    ran = False

    async def blocker(_ctx: JobContext) -> None:
        await release.wait()

    async def victim(_ctx: JobContext) -> None:
        nonlocal ran
        ran = True

    a = queue.submit(1, workspace.sessions, "demo", blocker)
    b = queue.submit(1, workspace.sessions, "demo", victim)
    await asyncio.sleep(0.02)
    queue.cancel(1, b.id)
    release.set()
    await queue.wait(1, a.id)
    await queue.wait(1, b.id)
    assert not ran
    assert store.get_job(workspace.sessions, b.id).state == "cancelled"


async def test_shutdown_cancels_running_jobs(workspace: OpenWorkspace) -> None:
    queue = JobQueue()
    started = asyncio.Event()

    async def work(_ctx: JobContext) -> None:
        started.set()
        await asyncio.sleep(60)

    info = queue.submit(1, workspace.sessions, "demo", work)
    await started.wait()
    await queue.shutdown()
    assert store.get_job(workspace.sessions, info.id).state == "cancelled"


def test_interrupted_jobs_fail_on_reopen(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    first = WorkspaceRegistry(settings)
    ws_id = first.create("W").id
    opened = first.open(ws_id)
    running = store.create_job(opened.sessions, "demo")
    store.set_state(opened.sessions, running.id, "running")
    done = store.create_job(opened.sessions, "demo")
    store.set_state(opened.sessions, done.id, "done")
    first.close()

    second = WorkspaceRegistry(settings)
    try:
        reopened = second.open(ws_id)
        interrupted = store.get_job(reopened.sessions, running.id)
        assert (interrupted.state, interrupted.error_code) == ("failed", "INTERRUPTED")
        assert store.get_job(reopened.sessions, done.id).state == "done"
        assert [j.id for j in store.list_jobs(reopened.sessions)] == [done.id, running.id]
    finally:
        second.close()


def test_get_unknown_job_raises(workspace: OpenWorkspace) -> None:
    with pytest.raises(JobNotFound):
        store.get_job(workspace.sessions, 999)
