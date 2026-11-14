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


class MaterialOut(BaseModel):
    id: int
    title: str
    kind: str = Field(description="pdf or text.")
    filename: str
    status: str = Field(description="queued, importing, indexed or failed.")
    page_count: int | None = None
    char_count: int | None = None
    ocr_confidence: float | None = None
    job_id: int | None = Field(default=None, description="Import job; follow it under /jobs.")
    error_code: str | None = None
    error_detail: str | None = None
    created_at: datetime


class ChunkOut(BaseModel):
    id: int
    material_id: int
    ordinal: int
    page: int | None = None
    section: str | None = None
    text: str


class SearchHitOut(BaseModel):
    chunk_id: int
    material_id: int
    material_title: str
    page: int | None = None
    section: str | None = None
    text: str
    score: float


class GenerationIn(BaseModel):
    material_id: int
    subtype: str = Field(description="qa, cloze, compare or true_false.")
    quantity: int = Field(default=20, description="1 to 60.")
    page_from: int | None = None
    page_to: int | None = None


class GenerationEstimateOut(BaseModel):
    estimated_usd: float | None = Field(description="Null when the model price is unknown.")
    chunks: int
    batches: int
    prompt_chars: int


class DiscardLogEntry(BaseModel):
    reason: str
    front: str


class RunOut(BaseModel):
    id: int
    kind: str
    subtype: str
    material_id: int | None = None
    page_from: int | None = None
    page_to: int | None = None
    model: str
    requested: int
    generated: int
    discarded_no_source: int
    discarded_invalid: int
    discarded_duplicate: int
    approved: int
    approved_unedited: int
    discarded_review: int
    cost_usd: float
    status: str = Field(description="queued, running, done, partial or cancelled.")
    discard_log: list[DiscardLogEntry]
    error_code: str | None = None
    error_detail: str | None = None
    job_id: int | None = Field(default=None, description="Follow it under /jobs.")
    created_at: datetime
    finished_at: datetime | None = None


class ItemOut(BaseModel):
    id: int
    run_id: int
    kind: str
    subtype: str
    front: str
    back: str
    status: str = Field(description="draft, approved or discarded.")
    topic: str | None = None
    source_title: str
    source_page: int | None = None
    quote: str
    chunk_id: int | None = None
    edited: bool
    origin: str
    created_at: datetime
    approved_at: datetime | None = None


class ItemEdit(BaseModel):
    front: str
    back: str = ""
    topic: str | None = None


class ReviewIn(BaseModel):
    approve: list[int] = []
    discard: list[int] = []


class ReviewOut(BaseModel):
    approved: int
    discarded: int
    skipped: int


class StudyCardOut(BaseModel):
    item: ItemOut
    is_new: bool
    state: int | None = Field(
        default=None, description="FSRS state: 1 learning, 2 review, 3 relearning."
    )
    due: datetime | None = None
    front_display: str = Field(description="What the front shows (cloze gaps appear as [...]).")
    back_display: str
    intervals: dict[int, str] = Field(description="Label of the next interval per rating (1-4).")


class RatingIn(BaseModel):
    item_id: int
    rating: int = Field(ge=1, le=4, description="1 again, 2 hard, 3 good, 4 easy.")
    duration_ms: int | None = Field(default=None, ge=0)


class RatingOut(BaseModel):
    item_id: int
    state: int
    due: datetime
    reps: int
    lapses: int


class UndoOut(BaseModel):
    item_id: int | None = Field(description="The card whose rating was undone, or null.")


class StudySummaryOut(BaseModel):
    learning: int
    review: int
    new_available: int
    reviewed_today: int
    new_studied_today: int
    to_study: int
    daily_goal: int
    new_per_day: int


class StudySettingsOut(BaseModel):
    new_per_day: int
    daily_goal: int
    desired_retention: float


class StudySettingsPatch(BaseModel):
    new_per_day: int | None = None
    daily_goal: int | None = None
    desired_retention: float | None = None


class FacetOut(BaseModel):
    key: int | str
    label: str
    count: int


class StudyFacetsOut(BaseModel):
    topics: list[FacetOut]
    materials: list[FacetOut]
    subtypes: list[FacetOut]
    cards: int
    questions: int
