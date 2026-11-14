# Filename: factory.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Builds the chat and embeddings services of a workspace on demand."""

from __future__ import annotations

from mind.chat.service import ChatService
from mind.jobs.queue import JobQueue
from mind.retrieval.embeddings import (
    Embedder,
    EmbeddingRetriever,
    EmbeddingsService,
    EmbeddingStore,
    HybridRetriever,
    SentenceTransformerEmbedder,
    extra_installed,
)
from mind.retrieval.retriever import Bm25Retriever, Retriever
from mind.services import Services
from mind.workspaces.registry import WorkspaceRegistry


class ChatFactory:
    def __init__(
        self,
        registry: WorkspaceRegistry,
        queue: JobQueue,
        services: Services,
        embedder: Embedder | None = None,
    ) -> None:
        self._registry = registry
        self._queue = queue
        self._services = services
        self._embedder: Embedder = embedder or SentenceTransformerEmbedder()
        # A custom embedder is always usable; the real one needs the optional extra.
        self._available = embedder is not None or extra_installed()

    def embeddings(self, workspace_id: int) -> EmbeddingsService:
        workspace = self._registry.open(workspace_id)
        return EmbeddingsService(
            workspace.info.id,
            workspace.sessions,
            self._queue,
            self._embedder,
            available=self._available,
        )

    def for_workspace(self, workspace_id: int) -> ChatService:
        workspace = self._registry.open(workspace_id)
        retriever: Retriever = Bm25Retriever(workspace.sessions)
        store = EmbeddingStore(workspace.sessions, self._embedder, available=self._available)
        if store.enabled():
            retriever = HybridRetriever(
                retriever, EmbeddingRetriever(workspace.sessions, self._embedder)
            )
        return ChatService(workspace.sessions, self._services, retriever)
