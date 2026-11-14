# Filename: workspace_models.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Models of each workspace database (`workspace.db`)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mind.clock import utcnow
from mind.db.base import UtcDateTime, WorkspaceBase


class Job(WorkspaceBase):
    __tablename__ = "job"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(16), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    message: Mapped[str] = mapped_column(String, default="")
    error_code: Mapped[str | None] = mapped_column(String(64), default=None)
    error_detail: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), default=None)


class Material(WorkspaceBase):
    __tablename__ = "material"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    page_count: Mapped[int | None] = mapped_column(Integer, default=None)
    char_count: Mapped[int | None] = mapped_column(Integer, default=None)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, default=None)
    job_id: Mapped[int | None] = mapped_column(Integer, default=None)
    error_code: Mapped[str | None] = mapped_column(String(64), default=None)
    error_detail: Mapped[str | None] = mapped_column(String, default=None)
    source_url: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    chunks: Mapped[list[Chunk]] = relationship(
        back_populates="material", cascade="all, delete-orphan", passive_deletes=True
    )


class Chunk(WorkspaceBase):
    __tablename__ = "chunk"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("material.id", ondelete="CASCADE"))
    ordinal: Mapped[int] = mapped_column(Integer)
    page: Mapped[int | None] = mapped_column(Integer, default=None)
    section: Mapped[str | None] = mapped_column(String, default=None)
    text: Mapped[str] = mapped_column(String)

    material: Mapped[Material] = relationship(back_populates="chunks")


class Topic(WorkspaceBase):
    __tablename__ = "topic"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class GenerationRun(WorkspaceBase):
    __tablename__ = "generation_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    subtype: Mapped[str] = mapped_column(String(24))
    material_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="SET NULL"), default=None
    )
    page_from: Mapped[int | None] = mapped_column(Integer, default=None)
    page_to: Mapped[int | None] = mapped_column(Integer, default=None)
    topic_id: Mapped[int | None] = mapped_column(
        ForeignKey("topic.id", ondelete="SET NULL"), default=None
    )
    model: Mapped[str] = mapped_column(String(128))
    requested: Mapped[int] = mapped_column(Integer)
    generated: Mapped[int] = mapped_column(Integer, default=0)
    discarded_no_source: Mapped[int] = mapped_column(Integer, default=0)
    discarded_invalid: Mapped[int] = mapped_column(Integer, default=0)
    discarded_duplicate: Mapped[int] = mapped_column(Integer, default=0)
    discarded_unsupported: Mapped[int] = mapped_column(Integer, default=0)
    approved: Mapped[int] = mapped_column(Integer, default=0)
    approved_unedited: Mapped[int] = mapped_column(Integer, default=0)
    discarded_review: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    discard_log: Mapped[str] = mapped_column(String, default="[]")
    error_code: Mapped[str | None] = mapped_column(String(64), default=None)
    error_detail: Mapped[str | None] = mapped_column(String, default=None)
    job_id: Mapped[int | None] = mapped_column(Integer, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), default=None)

    items: Mapped[list[Item]] = relationship(
        back_populates="run", cascade="all, delete-orphan", passive_deletes=True
    )


class Item(WorkspaceBase):
    __tablename__ = "item"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("generation_run.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    subtype: Mapped[str] = mapped_column(String(24))
    payload_json: Mapped[str] = mapped_column(String)
    payload_version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="draft")
    topic_id: Mapped[int | None] = mapped_column(
        ForeignKey("topic.id", ondelete="SET NULL"), default=None
    )
    chunk_id: Mapped[int | None] = mapped_column(
        ForeignKey("chunk.id", ondelete="SET NULL"), default=None
    )
    source_title: Mapped[str] = mapped_column(String(255), default="")
    source_page: Mapped[int | None] = mapped_column(Integer, default=None)
    quote: Mapped[str] = mapped_column(String, default="")
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    origin: Mapped[str] = mapped_column(String(16), default="generated")
    origin_item_id: Mapped[int | None] = mapped_column(Integer, default=None, index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), default=None)

    run: Mapped[GenerationRun] = relationship(back_populates="items")


class CardState(WorkspaceBase):
    __tablename__ = "card_state"

    item_id: Mapped[int] = mapped_column(
        ForeignKey("item.id", ondelete="CASCADE"), primary_key=True
    )
    fsrs_json: Mapped[str] = mapped_column(String)
    due: Mapped[datetime] = mapped_column(UtcDateTime(), index=True)
    state: Mapped[int] = mapped_column(Integer, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class ReviewLog(WorkspaceBase):
    __tablename__ = "review_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("item.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)
    reviewed_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    previous_state_json: Mapped[str | None] = mapped_column(String, default=None)
    duration_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    day: Mapped[str] = mapped_column(String(10), index=True)


class Meta(WorkspaceBase):
    """Per-workspace key/value settings (study limits, retention...)."""

    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String)


class Attempt(WorkspaceBase):
    """One answer to a question during practice."""

    __tablename__ = "attempt"
    __table_args__ = (Index("ix_attempt_item_answered", "item_id", "answered_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("item.id", ondelete="CASCADE"))
    answer: Mapped[str] = mapped_column(String(8))
    correct: Mapped[bool] = mapped_column(Boolean)
    seconds: Mapped[float | None] = mapped_column(Float, default=None)
    answered_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    day: Mapped[str] = mapped_column(String(10), index=True)


class ChatMessage(WorkspaceBase):
    """One question to the chat and its answer (each question is independent)."""

    __tablename__ = "chat_message"

    id: Mapped[int] = mapped_column(primary_key=True)
    question: Mapped[str] = mapped_column(String)
    answer: Mapped[str] = mapped_column(String)
    supported: Mapped[bool] = mapped_column(Boolean)
    citations_json: Mapped[str] = mapped_column(String)
    model: Mapped[str | None] = mapped_column(String, default=None)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class ChunkEmbedding(WorkspaceBase):
    """The optional vector of a chunk (float32, L2-normalized)."""

    __tablename__ = "chunk_embedding"

    chunk_id: Mapped[int] = mapped_column(
        ForeignKey("chunk.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(String)
    dim: Mapped[int] = mapped_column(Integer)
    vector: Mapped[bytes] = mapped_column(LargeBinary)
