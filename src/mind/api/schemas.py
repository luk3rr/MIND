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


class SettingsOut(BaseModel):
    """Provider settings. The API key is never part of any response."""

    provider: str
    generation_model: str
    judge_model: str
    monthly_limit_usd: float
    key_configured: bool
    key_source: str | None = Field(default=None, description="environment, file or null.")
    consent_given: bool


class SettingsPatch(BaseModel):
    provider: str | None = None
    generation_model: str | None = None
    judge_model: str | None = None
    monthly_limit_usd: float | None = None


class ConsentIn(BaseModel):
    accepted: bool


class CostLineOut(BaseModel):
    at: datetime
    provider: str
    model: str
    purpose: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


class CostsOut(BaseModel):
    month: str = Field(description="YYYY-MM")
    total_usd: float
    limit_usd: float
    entries: list[CostLineOut]


class EstimateIn(BaseModel):
    model: str
    prompt_chars: int = Field(ge=0)
    max_completion_tokens: int = Field(ge=0)


class EstimateOut(BaseModel):
    estimated_usd: float | None = Field(
        description="Null when the model price is unknown (refresh the catalog)."
    )
