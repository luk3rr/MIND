# Filename: store.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Persistence of jobs (the `job` table of each workspace)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import Job
from mind.errors import JobNotFound

JobState = Literal["queued", "running", "done", "failed", "cancelled"]
ACTIVE_STATES = ("queued", "running")


@dataclass(frozen=True)
class JobInfo:
    id: int
    type: str
    state: str
    progress: float
    message: str
    error_code: str | None
    error_detail: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


def _info(row: Job) -> JobInfo:
    return JobInfo(
        id=row.id,
        type=row.type,
        state=row.state,
        progress=row.progress,
        message=row.message,
        error_code=row.error_code,
        error_detail=row.error_detail,
        created_at=row.created_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
    )


def create_job(sessions: sessionmaker[Session], job_type: str) -> JobInfo:
    with sessions() as session:
        row = Job(type=job_type, state="queued")
        session.add(row)
        session.commit()
        return _info(row)


def get_job(sessions: sessionmaker[Session], job_id: int) -> JobInfo:
    with sessions() as session:
        row = session.get(Job, job_id)
        if row is None:
            raise JobNotFound(f"Não existe tarefa com id {job_id}.")
        return _info(row)


def list_jobs(sessions: sessionmaker[Session], *, limit: int = 50) -> list[JobInfo]:
    with sessions() as session:
        rows = session.scalars(select(Job).order_by(Job.id.desc()).limit(limit)).all()
        return [_info(row) for row in rows]


def set_state(
    sessions: sessionmaker[Session],
    job_id: int,
    state: JobState,
    *,
    error_code: str | None = None,
    error_detail: str | None = None,
) -> None:
    with sessions() as session:
        row = session.get(Job, job_id)
        if row is None:
            raise JobNotFound(f"Não existe tarefa com id {job_id}.")
        row.state = state
        if state == "running":
            row.started_at = utcnow()
        if state in ("done", "failed", "cancelled"):
            row.finished_at = utcnow()
        if state == "done":
            row.progress = 1.0
        row.error_code, row.error_detail = error_code, error_detail
        session.commit()


def set_progress(
    sessions: sessionmaker[Session], job_id: int, progress: float, message: str
) -> None:
    with sessions() as session:
        row = session.get(Job, job_id)
        if row is not None:
            row.progress = min(max(progress, 0.0), 1.0)
            row.message = message
            session.commit()


def recover_interrupted(sessions: sessionmaker[Session]) -> int:
    """Mark jobs that were active before a restart as `failed/INTERRUPTED`."""
    with sessions() as session:
        result = session.execute(
            update(Job)
            .where(Job.state.in_(ACTIVE_STATES))
            .values(
                state="failed",
                error_code="INTERRUPTED",
                error_detail="O aplicativo foi reiniciado durante a execução.",
                finished_at=utcnow(),
            )
        )
        session.commit()
        return int(getattr(result, "rowcount", 0) or 0)
