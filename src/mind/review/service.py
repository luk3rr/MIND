# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Review of generated items: list, edit, approve and discard."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import Chunk, GenerationRun, Item, Topic
from mind.errors import FieldError, ItemNotFound, ValidationFailed
from mind.generation.cards import clean_topic, payload_problem
from mind.workspaces.registry import WorkspaceRegistry

FRONT_PROBLEMS = {"empty_front", "empty_statement", "cloze_without_gap"}
PROBLEM_MESSAGES = {
    "empty_front": "A frente do card não pode ficar vazia.",
    "empty_back": "O verso do card não pode ficar vazio.",
    "cloze_without_gap": "Um card de lacuna precisa de {{c1::termo}} na frente.",
    "true_false_without_verdict": "O verso deve começar por Verdadeiro ou Falso.",
    "empty_statement": "O enunciado da questão não pode ficar vazio.",
    "empty_explanation": "O comentário da questão não pode ficar vazio.",
}


@dataclass(frozen=True)
class ItemInfo:
    id: int
    run_id: int
    kind: str
    subtype: str
    front: str
    back: str
    status: str
    topic: str | None
    source_title: str
    source_page: int | None
    quote: str
    chunk_id: int | None
    edited: bool
    origin: str
    created_at: datetime
    approved_at: datetime | None
    options: list[dict[str, str]] = field(default_factory=list)
    answer: str | None = None


@dataclass(frozen=True)
class ReviewResult:
    approved: int
    discarded: int
    skipped: int


class ReviewService:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    @staticmethod
    def _info(item: Item, topic: str | None) -> ItemInfo:
        payload = json.loads(item.payload_json)
        is_question = item.kind == "question"
        return ItemInfo(
            id=item.id,
            run_id=item.run_id,
            kind=item.kind,
            subtype=item.subtype,
            front=str(payload.get("statement" if is_question else "front", "")),
            back=str(payload.get("explanation" if is_question else "back", "")),
            status=item.status,
            topic=topic,
            source_title=item.source_title,
            source_page=item.source_page,
            quote=item.quote,
            chunk_id=item.chunk_id,
            edited=item.edited,
            origin=item.origin,
            created_at=item.created_at,
            approved_at=item.approved_at,
            options=[dict(o) for o in payload.get("options", [])] if is_question else [],
            answer=payload.get("answer") if is_question else None,
        )

    def _query(self, run_id: int | None, status: str | None, kind: str | None) -> Select[Item, str]:
        query = select(Item, Topic.name).outerjoin(Topic, Topic.id == Item.topic_id)
        if run_id is not None:
            query = query.where(Item.run_id == run_id)
        if status is not None:
            query = query.where(Item.status == status)
        if kind is not None:
            query = query.where(Item.kind == kind)
        return query

    def list_items(
        self,
        *,
        run_id: int | None = None,
        status: str | None = None,
        kind: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[ItemInfo]:
        query = self._query(run_id, status, kind).order_by(Item.id).offset(offset).limit(limit)
        with self._sessions() as session:
            return [self._info(item, topic) for item, topic in session.execute(query).all()]

    def count(
        self, *, run_id: int | None = None, status: str | None = None, kind: str | None = None
    ) -> int:
        query = select(func.count(Item.id))
        if run_id is not None:
            query = query.where(Item.run_id == run_id)
        if status is not None:
            query = query.where(Item.status == status)
        if kind is not None:
            query = query.where(Item.kind == kind)
        with self._sessions() as session:
            return int(session.scalar(query) or 0)

    def get(self, item_id: int) -> ItemInfo:
        with self._sessions() as session:
            row = session.execute(
                select(Item, Topic.name)
                .outerjoin(Topic, Topic.id == Item.topic_id)
                .where(Item.id == item_id)
            ).first()
            if row is None:
                raise ItemNotFound(f"Não existe item com id {item_id}.")
            return self._info(row[0], row[1])

    def source_text(self, chunk_id: int | None) -> str | None:
        """Text of the source chunk, or `None` when the chunk no longer exists."""
        if chunk_id is None:
            return None
        with self._sessions() as session:
            chunk = session.get(Chunk, chunk_id)
            return chunk.text if chunk else None

    def edit(self, item_id: int, front: str, back: str, topic: str | None) -> ItemInfo:
        """Change the text and topic of a draft or approved item; the source is kept."""
        with self._sessions() as session:
            item = session.get(Item, item_id)
            if item is None:
                raise ItemNotFound(f"Não existe item com id {item_id}.")
            if item.status == "discarded":
                raise ValidationFailed("Itens descartados não podem ser editados.")
            if item.kind == "question":
                problem = (
                    "empty_statement"
                    if not front.strip()
                    else "empty_explanation"
                    if not back.strip()
                    else None
                )
                keys = ("statement", "explanation")
            else:
                problem = payload_problem(item.subtype, front, back)
                keys = ("front", "back")
            if problem is not None:
                field = "front" if problem in FRONT_PROBLEMS else "back"
                raise ValidationFailed(
                    PROBLEM_MESSAGES[problem],
                    errors=[FieldError(field, PROBLEM_MESSAGES[problem])],
                )
            old = json.loads(item.payload_json)
            new = {**old, keys[0]: front.strip(), keys[1]: back.strip()}
            if new != old:
                item.payload_json = json.dumps(new, ensure_ascii=False)
                item.edited = True
            item.topic_id = self._topic_id(session, clean_topic(topic))
            session.commit()
        return self.get(item_id)

    @staticmethod
    def _topic_id(session: Session, name: str | None) -> int | None:
        if name is None:
            return None
        found = session.scalar(select(Topic).where(func.lower(Topic.name) == name.lower()))
        if found is None:
            found = Topic(name=name)
            session.add(found)
            session.flush()
        return found.id

    def review(self, approve: Sequence[int] = (), discard: Sequence[int] = ()) -> ReviewResult:
        """Approve or discard drafts and keep the per-run counters used to measure SM-1."""
        approved = discarded = skipped = 0
        with self._sessions() as session:
            for item_id in dict.fromkeys(approve):
                item = session.get(Item, item_id)
                if item is None or item.status != "draft":
                    skipped += 1
                    continue
                item.status = "approved"
                item.approved_at = utcnow()
                run = session.get(GenerationRun, item.run_id)
                if run is not None:
                    run.approved += 1
                    if not item.edited:
                        run.approved_unedited += 1
                approved += 1
            for item_id in dict.fromkeys(discard):
                item = session.get(Item, item_id)
                if item is None or item.status != "draft" or item_id in set(approve):
                    skipped += 1
                    continue
                item.status = "discarded"
                run = session.get(GenerationRun, item.run_id)
                if run is not None:
                    run.discarded_review += 1
                discarded += 1
            session.commit()
        return ReviewResult(approved, discarded, skipped)

    def approve_all(self, run_id: int) -> ReviewResult:
        ids = [i.id for i in self.list_items(run_id=run_id, status="draft", limit=10_000)]
        return self.review(approve=ids)


class ReviewFactory:
    """Builds the `ReviewService` of a workspace on demand."""

    def __init__(self, registry: WorkspaceRegistry) -> None:
        self._registry = registry

    def for_workspace(self, workspace_id: int) -> ReviewService:
        return ReviewService(self._registry.open(workspace_id).sessions)
