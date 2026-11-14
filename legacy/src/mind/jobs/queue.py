# Filename: queue.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""In-process job queue (asyncio) with state persisted in SQLite."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from sqlalchemy.orm import Session, sessionmaker

from mind.errors import AppError
from mind.jobs import store
from mind.jobs.store import JobInfo

logger = logging.getLogger(__name__)


class JobCancelled(Exception):
    """Raised by `JobContext.check_cancelled` when the job was cancelled."""


class JobContext:
    """Passed to the job work to report progress and check for cancellation."""

    def __init__(
        self,
        sessions: sessionmaker[Session],
        job_id: int,
        *,
        min_interval: float = 0.25,
    ) -> None:
        self._sessions = sessions
        self.job_id = job_id
        self._min_interval = min_interval
        self._last_write = 0.0
        self.cancelled = False

    def update(self, progress: float, message: str = "") -> None:
        now = time.monotonic()
        if progress >= 1.0 or now - self._last_write >= self._min_interval:
            self._last_write = now
            store.set_progress(self._sessions, self.job_id, progress, message)

    def check_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled


JobWork = Callable[[JobContext], Awaitable[None]]


class JobQueue:
    def __init__(self, max_concurrent: int = 2, *, progress_interval: float = 0.25) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._progress_interval = progress_interval
        self._tasks: dict[tuple[int, int], asyncio.Task[None]] = {}
        self._contexts: dict[tuple[int, int], JobContext] = {}

    def submit(
        self,
        workspace_id: int,
        sessions: sessionmaker[Session],
        job_type: str,
        work: JobWork,
    ) -> JobInfo:
        info = store.create_job(sessions, job_type)
        key = (workspace_id, info.id)
        ctx = JobContext(sessions, info.id, min_interval=self._progress_interval)
        self._contexts[key] = ctx
        self._tasks[key] = asyncio.create_task(self._run(key, sessions, ctx, work))
        return info

    async def _run(
        self,
        key: tuple[int, int],
        sessions: sessionmaker[Session],
        ctx: JobContext,
        work: JobWork,
    ) -> None:
        job_id = ctx.job_id
        try:
            async with self._semaphore:
                if ctx.cancelled:
                    store.set_state(sessions, job_id, "cancelled")
                    return
                store.set_state(sessions, job_id, "running")
                try:
                    await work(ctx)
                except JobCancelled:
                    store.set_state(sessions, job_id, "cancelled")
                except AppError as exc:
                    store.set_state(
                        sessions, job_id, "failed", error_code=exc.code, error_detail=exc.detail
                    )
                except asyncio.CancelledError:
                    store.set_state(sessions, job_id, "cancelled")
                    raise
                except Exception as exc:
                    logger.exception("Job %s failed", job_id)
                    store.set_state(
                        sessions,
                        job_id,
                        "failed",
                        error_code="INTERNAL_ERROR",
                        error_detail=str(exc),
                    )
                else:
                    if ctx.cancelled:
                        store.set_state(sessions, job_id, "cancelled")
                    else:
                        store.set_state(sessions, job_id, "done")
        finally:
            self._tasks.pop(key, None)
            self._contexts.pop(key, None)

    def cancel(self, workspace_id: int, job_id: int) -> bool:
        """Request cancellation. Return `False` if the job is not active in this queue."""
        ctx = self._contexts.get((workspace_id, job_id))
        if ctx is None:
            return False
        ctx.cancelled = True
        return True

    async def wait(self, workspace_id: int, job_id: int) -> None:
        task = self._tasks.get((workspace_id, job_id))
        if task is not None:
            await asyncio.shield(task)

    async def shutdown(self) -> None:
        for task in list(self._tasks.values()):
            task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)
