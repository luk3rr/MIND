# Filename: costs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Spending ledger and model price catalog (FR-21)."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.app_models import CostEntry, ModelPrice
from mind.llm.types import Usage

logger = logging.getLogger(__name__)

MODELS_URL = "https://openrouter.ai/api/v1/models"
PRICE_MAX_AGE = timedelta(hours=24)
CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class Price:
    prompt_usd_per_token: float
    completion_usd_per_token: float


@dataclass(frozen=True)
class CostLine:
    at: datetime
    provider: str
    model: str
    purpose: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


def month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1, tzinfo=UTC)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=UTC)
    return start, end


class PriceCatalog:
    """Model prices cached in the database and refreshed from the public catalog."""

    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    def get(self, model: str) -> Price | None:
        with self._sessions() as session:
            row = session.get(ModelPrice, model)
            if row is None:
                return None
            return Price(row.prompt_usd_per_token, row.completion_usd_per_token)

    def known_models(self) -> list[str]:
        with self._sessions() as session:
            return list(session.scalars(select(ModelPrice.model).order_by(ModelPrice.model)))

    def is_fresh(self) -> bool:
        with self._sessions() as session:
            newest = session.scalar(select(func.max(ModelPrice.fetched_at)))
        return newest is not None and utcnow() - newest < PRICE_MAX_AGE

    async def refresh(self, client: httpx.AsyncClient, *, force: bool = False) -> bool:
        """Fetch prices when the cache is stale. Return `False` if the fetch failed."""
        if not force and self.is_fresh():
            return True
        try:
            response = await client.get(MODELS_URL, timeout=15.0)
            response.raise_for_status()
            entries = response.json()["data"]
            now = utcnow()
            rows = [
                ModelPrice(
                    model=str(entry["id"]),
                    prompt_usd_per_token=float(entry["pricing"]["prompt"]),
                    completion_usd_per_token=float(entry["pricing"]["completion"]),
                    fetched_at=now,
                )
                for entry in entries
                if entry.get("pricing", {}).get("prompt") is not None
                and entry.get("pricing", {}).get("completion") is not None
            ]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Could not refresh the model price catalog: %s", type(exc).__name__)
            return False
        with self._sessions() as session:
            for row in rows:
                session.merge(row)
            session.commit()
        return True

    def estimate(self, model: str, prompt_chars: int, max_completion_tokens: int) -> float | None:
        """Estimate the cost of a call, or `None` when the model price is unknown."""
        price = self.get(model)
        if price is None:
            return None
        prompt_tokens = math.ceil(prompt_chars / CHARS_PER_TOKEN)
        return (
            prompt_tokens * price.prompt_usd_per_token
            + max_completion_tokens * price.completion_usd_per_token
        )


class CostLedger:
    def __init__(self, sessions: sessionmaker[Session], catalog: PriceCatalog) -> None:
        self._sessions = sessions
        self._catalog = catalog

    def record(self, provider: str, model: str, purpose: str, usage: Usage) -> float:
        """Store one call. The provider-reported cost wins; otherwise tokens times price."""
        cost = usage.cost_usd
        if cost is None:
            price = self._catalog.get(model)
            cost = (
                0.0
                if price is None
                else usage.prompt_tokens * price.prompt_usd_per_token
                + usage.completion_tokens * price.completion_usd_per_token
            )
        with self._sessions() as session:
            session.add(
                CostEntry(
                    provider=provider,
                    model=model,
                    purpose=purpose,
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    cost_usd=cost,
                )
            )
            session.commit()
        return cost

    def month_total(self, year: int, month: int) -> float:
        start, end = month_bounds(year, month)
        with self._sessions() as session:
            total = session.scalar(
                select(func.coalesce(func.sum(CostEntry.cost_usd), 0.0)).where(
                    CostEntry.at >= start, CostEntry.at < end
                )
            )
        return float(total or 0.0)

    def spent_this_month(self) -> float:
        now = utcnow()
        return self.month_total(now.year, now.month)

    def month_lines(self, year: int, month: int) -> list[CostLine]:
        start, end = month_bounds(year, month)
        with self._sessions() as session:
            rows = session.scalars(
                select(CostEntry)
                .where(CostEntry.at >= start, CostEntry.at < end)
                .order_by(CostEntry.at.desc(), CostEntry.id.desc())
            ).all()
            return [
                CostLine(
                    r.at,
                    r.provider,
                    r.model,
                    r.purpose,
                    r.prompt_tokens,
                    r.completion_tokens,
                    r.cost_usd,
                )
                for r in rows
            ]
