# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Answer questions from the workspace's material, with verified citations (FR-18)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mind.chat.prompts import build_chat_messages
from mind.chat.schemas import ChatAnswer
from mind.clock import utcnow
from mind.db.workspace_models import ChatMessage
from mind.errors import FieldError, ValidationFailed
from mind.generation.prompts import PromptChunk
from mind.retrieval.retriever import RetrievedChunk, Retriever
from mind.services import Services
from mind.verification.source_checker import SourceChecker

NO_SUPPORT = "Não encontrei suporte no material para responder a essa pergunta."
MAX_QUESTION_CHARS = 1000
RETRIEVE_LIMIT = 8
HISTORY_LIMIT = 50


@dataclass(frozen=True)
class CitationInfo:
    chunk_id: int
    material_id: int
    material_title: str
    page: int | None
    section: str | None
    quote: str


@dataclass(frozen=True)
class ChatReply:
    id: int
    question: str
    answer: str
    supported: bool
    citations: list[CitationInfo]
    cost_usd: float
    created_at: datetime


def chunk_label(chunk: RetrievedChunk) -> str:
    where = f", p. {chunk.page}" if chunk.page else ""
    return f"{chunk.material_title}{where}"


def to_reply(row: ChatMessage) -> ChatReply:
    return ChatReply(
        id=row.id,
        question=row.question,
        answer=row.answer,
        supported=row.supported,
        citations=[CitationInfo(**c) for c in json.loads(row.citations_json)],
        cost_usd=row.cost_usd,
        created_at=row.created_at,
    )


class ChatService:
    def __init__(
        self,
        sessions: sessionmaker[Session],
        services: Services,
        retriever: Retriever,
        checker: SourceChecker | None = None,
    ) -> None:
        self._sessions = sessions
        self._services = services
        self._retriever = retriever
        self._checker = checker or SourceChecker()

    async def ask(self, question: str) -> ChatReply:
        """Answer one independent question. The model is called only when excerpts were found."""
        clean = " ".join(question.split())
        if not clean:
            raise ValidationFailed(
                "Escreva uma pergunta.", errors=[FieldError("question", "Informe a pergunta.")]
            )
        if len(clean) > MAX_QUESTION_CHARS:
            raise ValidationFailed(
                "A pergunta é longa demais.",
                errors=[FieldError("question", f"Use até {MAX_QUESTION_CHARS} caracteres.")],
            )
        found = self._retriever.search(clean, limit=RETRIEVE_LIMIT)
        if not found:
            return self._store(clean, NO_SUPPORT, False, [], None, 0.0)

        self._services.ensure_ready()
        model = self._services.settings.get().generation_model
        prompt = [PromptChunk(c.chunk_id, chunk_label(c), c.text) for c in found]
        answer, usage = await self._services.provider.complete(
            build_chat_messages(clean, prompt), ChatAnswer, model=model, purpose="chat"
        )
        citations = self._valid_citations(answer, found)
        cost = usage.cost_usd or 0.0
        if not answer.supported or not citations or not answer.answer.strip():
            return self._store(clean, NO_SUPPORT, False, [], model, cost)
        return self._store(clean, answer.answer.strip(), True, citations, model, cost)

    def _valid_citations(
        self, answer: ChatAnswer, found: list[RetrievedChunk]
    ) -> list[CitationInfo]:
        by_id = {c.chunk_id: c for c in found}
        kept: list[CitationInfo] = []
        seen: set[tuple[int, str]] = set()
        for citation in answer.citations:
            chunk = by_id.get(citation.chunk_id)
            if chunk is None or not self._checker.check(citation.quote, chunk.text).valid:
                continue
            key = (chunk.chunk_id, citation.quote)
            if key in seen:
                continue
            seen.add(key)
            kept.append(
                CitationInfo(
                    chunk.chunk_id,
                    chunk.material_id,
                    chunk.material_title,
                    chunk.page,
                    chunk.section,
                    citation.quote,
                )
            )
        return kept

    def _store(
        self,
        question: str,
        answer: str,
        supported: bool,
        citations: list[CitationInfo],
        model: str | None,
        cost: float,
    ) -> ChatReply:
        with self._sessions() as session:
            row = ChatMessage(
                question=question,
                answer=answer,
                supported=supported,
                citations_json=json.dumps([asdict(c) for c in citations]),
                model=model,
                cost_usd=cost,
                created_at=utcnow(),
            )
            session.add(row)
            session.commit()
            return to_reply(row)

    def history(self, limit: int = HISTORY_LIMIT) -> list[ChatReply]:
        """The latest messages, oldest first."""
        with self._sessions() as session:
            rows = session.scalars(
                select(ChatMessage).order_by(ChatMessage.id.desc()).limit(limit)
            ).all()
            return [to_reply(r) for r in reversed(rows)]

    def clear(self) -> int:
        with self._sessions() as session:
            rows = session.scalars(select(ChatMessage)).all()
            for row in rows:
                session.delete(row)
            session.commit()
            return len(rows)
