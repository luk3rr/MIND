# Filename: training.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Choosing the material of a training run on one topic (the user's weak points)."""

from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Attempt, Chunk, Item, Material, ReviewLog, Topic
from mind.errors import TopicNotFound
from mind.generation.planning import SourceChunk
from mind.retrieval.retriever import Bm25Retriever

MAX_CHUNKS = 30
MAX_AVOID = 25
SEARCH_LIMIT = 20


@dataclass(frozen=True)
class TrainingMaterial:
    topic_name: str
    chunks: list[SourceChunk]
    avoid: list[str]


def _failed_chunk_ids(session: Session, topic_id: int) -> list[int]:
    """Source chunks of the topic's items the user got wrong, most failures first."""
    cards = session.execute(
        select(Item.chunk_id, func.count())
        .join(ReviewLog, ReviewLog.item_id == Item.id)
        .where(
            Item.topic_id == topic_id,
            Item.status == "approved",
            ReviewLog.rating == 1,
            Item.chunk_id.is_not(None),
        )
        .group_by(Item.chunk_id)
    ).all()
    questions = session.execute(
        select(Item.chunk_id, func.count())
        .join(Attempt, Attempt.item_id == Item.id)
        .where(
            Item.topic_id == topic_id,
            Item.status == "approved",
            Attempt.correct.is_(False),
            Item.chunk_id.is_not(None),
        )
        .group_by(Item.chunk_id)
    ).all()
    score: dict[int, int] = {}
    for chunk_id, count in [*cards, *questions]:
        if chunk_id is not None:
            score[int(chunk_id)] = score.get(int(chunk_id), 0) + int(count)
    return [i for i, _ in sorted(score.items(), key=lambda pair: (-pair[1], pair[0]))]


def _existing_texts(session: Session, topic_id: int) -> list[str]:
    rows = session.scalars(
        select(Item.payload_json)
        .where(Item.topic_id == topic_id, Item.status != "discarded")
        .order_by(Item.id.desc())
        .limit(MAX_AVOID)
    )
    texts = []
    for payload in rows:
        data = json.loads(payload)
        text = str(data.get("front") or data.get("statement") or "").strip().split("\n")[0]
        if text:
            texts.append(text[:160])
    return texts


def training_material(sessions: sessionmaker[Session], topic_id: int) -> TrainingMaterial:
    """Failed source chunks first, then the best BM25 matches for the topic name."""
    with sessions() as session:
        topic = session.get(Topic, topic_id)
        if topic is None:
            raise TopicNotFound(f"Não existe tópico com id {topic_id}.")
        name = topic.name
        ordered = _failed_chunk_ids(session, topic_id)
        avoid = _existing_texts(session, topic_id)
    for hit in Bm25Retriever(sessions).search(name, limit=SEARCH_LIMIT):
        if hit.chunk_id not in ordered:
            ordered.append(hit.chunk_id)
    ordered = ordered[:MAX_CHUNKS]
    with sessions() as session:
        rows = {
            c.id: (c, title)
            for c, title in session.execute(
                select(Chunk, Material.title)
                .join(Material, Material.id == Chunk.material_id)
                .where(Chunk.id.in_(ordered or [0]))
            ).all()
        }
    chunks = [
        SourceChunk(c.id, c.material_id, title, c.page, c.section, c.text)
        for c, title in (rows[i] for i in ordered if i in rows)
    ]
    return TrainingMaterial(topic_name=name, chunks=chunks, avoid=avoid)
