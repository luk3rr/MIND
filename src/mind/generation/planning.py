# Filename: planning.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Choosing which chunks to send and how many items to ask from each batch."""

from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Chunk, Material

BATCH_CHARS = 6000
CARDS_PER_BATCH = 5
QUESTIONS_PER_BATCH = 3


@dataclass(frozen=True)
class SourceChunk:
    id: int
    material_id: int
    material_title: str
    page: int | None
    section: str | None
    text: str

    @property
    def label(self) -> str:
        parts = [self.material_title]
        if self.page is not None:
            parts.append(f"p.{self.page}")
        if self.section:
            parts.append(self.section)
        return " ".join(parts)


@dataclass(frozen=True)
class PlannedBatch:
    chunks: list[SourceChunk]
    count: int


def select_chunks(
    sessions: sessionmaker[Session],
    material_id: int,
    page_from: int | None = None,
    page_to: int | None = None,
) -> list[SourceChunk]:
    query = (
        select(Chunk, Material.title)
        .join(Material, Material.id == Chunk.material_id)
        .where(Chunk.material_id == material_id)
        .order_by(Chunk.ordinal)
    )
    if page_from is not None:
        query = query.where(Chunk.page >= page_from)
    if page_to is not None:
        query = query.where(Chunk.page <= page_to)
    with sessions() as session:
        return [
            SourceChunk(c.id, c.material_id, title, c.page, c.section, c.text)
            for c, title in session.execute(query).all()
        ]


def make_batches(
    chunks: list[SourceChunk], max_chars: int = BATCH_CHARS
) -> list[list[SourceChunk]]:
    batches: list[list[SourceChunk]] = []
    current: list[SourceChunk] = []
    size = 0
    for chunk in chunks:
        if current and size + len(chunk.text) > max_chars:
            batches.append(current)
            current, size = [], 0
        current.append(chunk)
        size += len(chunk.text)
    if current:
        batches.append(current)
    return batches


def split_quantity(quantity: int, parts: int) -> list[int]:
    base, extra = divmod(quantity, parts)
    return [base + (1 if index < extra else 0) for index in range(parts)]


def spread_indices(total: int, wanted: int) -> list[int]:
    """Pick `wanted` indices evenly spread over `range(total)`."""
    if wanted >= total:
        return list(range(total))
    if wanted == 1:
        return [total // 2]
    return [round(i * (total - 1) / (wanted - 1)) for i in range(wanted)]


def plan_batches(
    chunks: list[SourceChunk],
    quantity: int,
    per_batch: int = CARDS_PER_BATCH,
    *,
    spread: bool = True,
) -> list[PlannedBatch]:
    """Group chunks, pick batches and split the requested quantity among them.

    By default the batches are spread evenly over the chunks; with `spread=False` the first
    batches are used (training puts the most relevant chunks first)."""
    batches = make_batches(chunks)
    if not batches or quantity < 1:
        return []
    wanted = min(math.ceil(quantity / per_batch), len(batches))
    indices = spread_indices(len(batches), wanted) if spread else list(range(wanted))
    chosen = [batches[i] for i in indices]
    return [
        PlannedBatch(b, n) for b, n in zip(chosen, split_quantity(quantity, wanted), strict=True)
    ]
