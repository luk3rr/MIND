# Filename: schemas.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Request and response models of the v1 JSON API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class WorkspaceIn(BaseModel):
    name: str = Field(description="Workspace name (1 to 80 characters, unique ignoring case).")


class WorkspaceOut(BaseModel):
    id: int
    name: str
    created_at: datetime


class JobOut(BaseModel):
    id: int
    type: str
    state: str = Field(description="queued, running, done, failed or cancelled.")
    progress: float = Field(ge=0, le=1)
    message: str
    error_code: str | None = None
    error_detail: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None


class FieldErrorOut(BaseModel):
    field: str
    message: str


class Problem(BaseModel):
    """RFC 9457 problem details with a stable application `code`."""

    type: str
    title: str
    status: int
    code: str
    detail: str = ""
    instance: str = ""
    errors: list[FieldErrorOut] = []
