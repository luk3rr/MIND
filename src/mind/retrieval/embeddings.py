# Filename: embeddings.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Optional semantic search: embeddings of the chunks, cosine similarity and RRF fusion.

Vectors are stored as float32 BLOBs, L2-normalized, so cosine similarity is a dot product. The
search runs in memory in pure Python, which is enough for a personal library (see backlog B-13).
The real embedder needs the extra `mind[embeddings]`; everything else works without it.
"""

from __future__ import annotations

import asyncio
import importlib.util
import math
from array import array
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Chunk, ChunkEmbedding, Material, Meta
from mind.errors import AppError
from mind.jobs.queue import JobContext, JobQueue
from mind.retrieval.retriever import RetrievedChunk, Retriever

DEFAULT_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
META_KEY = "embeddings"
BATCH = 32
RRF_K = 60
CANDIDATES = 40


class EmbeddingsUnavailable(AppError):
    code = "EMBEDDINGS_UNAVAILABLE"
    status = 409
    title = "Embeddings indisponíveis"


class Embedder(Protocol):
    model_name: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def extra_installed() -> bool:
    return importlib.util.find_spec("sentence_transformers") is not None


class SentenceTransformerEmbedder:
    """Loads the model on first use, so importing MIND never pulls in torch."""

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        self.model_name = model_name
        self._model: Any = None

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if self._model is None:
            if not extra_installed():
                raise EmbeddingsUnavailable(
                    "Instale o extra de embeddings: pip install 'mind-study[embeddings]'."
                )
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.model_name)
        encoded = self._model.encode(list(texts), show_progress_bar=False)
        return [[float(x) for x in row] for row in encoded]


def normalize_vector(vector: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vector))
    return [x / norm for x in vector] if norm else list(vector)


def pack(vector: Sequence[float]) -> bytes:
    return array("f", normalize_vector(vector)).tobytes()


def unpack(blob: bytes) -> array[float]:
    values: array[float] = array("f")
    values.frombytes(blob)
    return values


def dot(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


@dataclass(frozen=True)
class EmbeddingStatus:
    available: bool  # the extra is installed (or a custom embedder is configured)
    enabled: bool
    indexed: int
    total: int


class EmbeddingStore:
    """Vectorizes chunks and keeps the per-workspace on/off switch."""

    def __init__(
        self, sessions: sessionmaker[Session], embedder: Embedder, *, available: bool
    ) -> None:
        self._sessions = sessions
        self._embedder = embedder
        self._available = available

    def enabled(self) -> bool:
        with self._sessions() as session:
            row = session.get(Meta, META_KEY)
            return row is not None and row.value == "on"

    def set_enabled(self, value: bool) -> None:
        with self._sessions() as session:
            session.merge(Meta(key=META_KEY, value="on" if value else "off"))
            session.commit()

    def status(self) -> EmbeddingStatus:
        with self._sessions() as session:
            indexed = session.scalar(
                select(func.count())
                .select_from(ChunkEmbedding)
                .where(ChunkEmbedding.model == self._embedder.model_name)
            )
            total = session.scalar(select(func.count()).select_from(Chunk))
        return EmbeddingStatus(self._available, self.enabled(), indexed or 0, total or 0)

    def _pending(self) -> list[tuple[int, str]]:
        with self._sessions() as session:
            done = select(ChunkEmbedding.chunk_id).where(
                ChunkEmbedding.model == self._embedder.model_name
            )
            rows = session.execute(
                select(Chunk.id, Chunk.text).where(Chunk.id.not_in(done)).order_by(Chunk.id)
            ).all()
        return [(row[0], row[1]) for row in rows]

    def index_pending(self, update: Callable[[float, str], None] | None = None) -> int:
        """Embed every chunk that has no vector for the current model. Returns how many."""
        pending = self._pending()
        for start in range(0, len(pending), BATCH):
            batch = pending[start : start + BATCH]
            vectors = self._embedder.embed([text for _, text in batch])
            with self._sessions() as session:
                for (chunk_id, _), vector in zip(batch, vectors, strict=True):
                    session.execute(
                        delete(ChunkEmbedding).where(ChunkEmbedding.chunk_id == chunk_id)
                    )
                    session.add(
                        ChunkEmbedding(
                            chunk_id=chunk_id,
                            model=self._embedder.model_name,
                            dim=len(vector),
                            vector=pack(vector),
                        )
                    )
                session.commit()
            if update is not None:
                update(min(1.0, (start + len(batch)) / len(pending)), "vetorizando trechos")
        return len(pending)


class EmbeddingRetriever:
    def __init__(self, sessions: sessionmaker[Session], embedder: Embedder) -> None:
        self._sessions = sessions
        self._embedder = embedder

    def search(
        self,
        query: str,
        *,
        material_ids: Sequence[int] | None = None,
        page_from: int | None = None,
        page_to: int | None = None,
        limit: int = 20,
    ) -> list[RetrievedChunk]:
        if not query.strip() or limit < 1:
            return []
        wanted = normalize_vector(self._embedder.embed([query])[0])
        statement = (
            select(ChunkEmbedding.chunk_id, ChunkEmbedding.vector)
            .join(Chunk, Chunk.id == ChunkEmbedding.chunk_id)
            .where(ChunkEmbedding.model == self._embedder.model_name)
        )
        if material_ids is not None:
            statement = statement.where(Chunk.material_id.in_(list(material_ids)))
        if page_from is not None:
            statement = statement.where(Chunk.page >= page_from)
        if page_to is not None:
            statement = statement.where(Chunk.page <= page_to)
        with self._sessions() as session:
            scored = [
                (row[0], dot(wanted, unpack(row[1]))) for row in session.execute(statement).all()
            ]
            top = sorted(scored, key=lambda pair: (-pair[1], pair[0]))[:limit]
            found: list[RetrievedChunk] = []
            for chunk_id, score in top:
                chunk = session.get(Chunk, chunk_id)
                material = session.get(Material, chunk.material_id) if chunk else None
                if chunk is None or material is None:
                    continue
                found.append(
                    RetrievedChunk(
                        chunk.id,
                        material.id,
                        material.title,
                        chunk.page,
                        chunk.section,
                        chunk.text,
                        score,
                    )
                )
        return found


class HybridRetriever:
    """Fuses the BM25 and the semantic rankings with Reciprocal Rank Fusion."""

    def __init__(self, lexical: Retriever, semantic: Retriever) -> None:
        self._lexical = lexical
        self._semantic = semantic

    def search(
        self,
        query: str,
        *,
        material_ids: Sequence[int] | None = None,
        page_from: int | None = None,
        page_to: int | None = None,
        limit: int = 20,
    ) -> list[RetrievedChunk]:
        options = {
            "material_ids": material_ids,
            "page_from": page_from,
            "page_to": page_to,
            "limit": max(limit, CANDIDATES),
        }
        lexical = self._lexical.search(query, **options)  # type: ignore[arg-type]
        try:
            semantic = self._semantic.search(query, **options)  # type: ignore[arg-type]
        except EmbeddingsUnavailable:
            # The extra was removed after the option was turned on: keep working with BM25 only.
            return lexical[:limit]
        rankings = (lexical, semantic)
        fused: dict[int, float] = {}
        by_id: dict[int, RetrievedChunk] = {}
        for ranking in rankings:
            for rank, chunk in enumerate(ranking, start=1):
                fused[chunk.chunk_id] = fused.get(chunk.chunk_id, 0.0) + 1.0 / (RRF_K + rank)
                by_id.setdefault(chunk.chunk_id, chunk)
        order = sorted(fused, key=lambda cid: (-fused[cid], cid))[:limit]
        return [
            RetrievedChunk(
                c.chunk_id, c.material_id, c.material_title, c.page, c.section, c.text, fused[cid]
            )
            for cid in order
            for c in [by_id[cid]]
        ]


class EmbeddingsService:
    """Per-workspace control of the optional embeddings: status, enable, disable, re-index."""

    def __init__(
        self,
        workspace_id: int,
        sessions: sessionmaker[Session],
        queue: JobQueue,
        embedder: Embedder,
        *,
        available: bool,
    ) -> None:
        self._workspace_id = workspace_id
        self._queue = queue
        self._store = EmbeddingStore(sessions, embedder, available=available)
        self._sessions = sessions
        self._available = available

    def status(self) -> EmbeddingStatus:
        return self._store.status()

    def enable(self) -> int | None:
        """Turn the option on and queue the job that vectorizes the chunks still without one.

        Must run inside the event loop. Returns the job id (None when nothing is pending).
        """
        if not self._available:
            raise EmbeddingsUnavailable(
                "Instale o extra de embeddings: pip install 'mind-study[embeddings]'."
            )
        self._store.set_enabled(True)
        if self._store.status().indexed >= self._store.status().total:
            return None

        async def work(ctx: JobContext) -> None:
            def step(progress: float, message: str) -> None:
                ctx.update(progress, message)
                ctx.check_cancelled()

            await asyncio.to_thread(self._store.index_pending, step)

        return self._queue.submit(self._workspace_id, self._sessions, "embeddings", work).id

    def disable(self) -> None:
        self._store.set_enabled(False)
