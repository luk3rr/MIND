# Filename: app_models.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Models of the global `app.db` database."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Float, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from mind.clock import utcnow
from mind.db.base import AppBase, UtcDateTime


class Workspace(AppBase):
    __tablename__ = "workspace"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    name_key: Mapped[str] = mapped_column(String(80), unique=True)
    folder: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class Setting(AppBase):
    __tablename__ = "setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String)


class Consent(AppBase):
    __tablename__ = "consent"

    provider: Mapped[str] = mapped_column(String(64), primary_key=True)
    accepted_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class CostEntry(AppBase):
    __tablename__ = "cost_ledger"
    __table_args__ = (Index("ix_cost_ledger_at", "at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    purpose: Mapped[str] = mapped_column(String(64))
    prompt_tokens: Mapped[int]
    completion_tokens: Mapped[int]
    cost_usd: Mapped[float] = mapped_column(Float)


class ModelPrice(AppBase):
    __tablename__ = "model_price"

    model: Mapped[str] = mapped_column(String(128), primary_key=True)
    prompt_usd_per_token: Mapped[float] = mapped_column(Float)
    completion_usd_per_token: Mapped[float] = mapped_column(Float)
    fetched_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
