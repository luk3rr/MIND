# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Turn mistakes into cards and list everything the user got wrong."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import Attempt, GenerationRun, Item, ReviewLog, Topic
from mind.errors import ItemNotFound, ValidationFailed
from mind.workspaces.registry import WorkspaceRegistry

NOTEBOOK_KIND = "notebook"
ERROR_NOTE = "error_note"


@dataclass(frozen=True)
class CardCreated:
    item_id: int
    created: bool  # False when the card already existed


@dataclass(frozen=True)
class ErrorEntry:
    item_id: int
    front: str
    topic: str | None
    source_title: str
    source_page: int | None
    from_question: bool
    failures: int  # times the card was rated "Errei"
    last_error_at: datetime


@dataclass(frozen=True)
class ErrorCounts:
    total: int
    from_questions: int
    failed_cards: int


def error_card_text(subtype: str, payload: Mapping[str, Any]) -> tuple[str, str, str]:
    """(card subtype, front, back) for the card that revisits a missed question."""
    statement = str(payload["statement"]).strip()
    explanation = str(payload["explanation"]).strip()
    answer = str(payload["answer"])
    if subtype == "certo_errado":
        verdict = "Verdadeiro" if answer == "C" else "Falso"
        return "true_false", statement, f"{verdict}. {explanation}"
    options = [dict(o) for o in payload["options"]]
    listing = "\n".join(f"{o['key']}) {o['text']}" for o in options)
    right = next((o for o in options if o["key"] == answer), {"text": ""})
    return (
        "qa",
        f"{statement}\n\n{listing}",
        f"Resposta: {answer}) {right['text']}\n\n{explanation}",
    )


class ErrorNotebook:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    @staticmethod
    def _run_id(session: Session) -> int:
        run = session.scalars(
            select(GenerationRun).where(GenerationRun.kind == NOTEBOOK_KIND).limit(1)
        ).first()
        if run is None:
            run = GenerationRun(
                kind=NOTEBOOK_KIND,
                subtype=ERROR_NOTE,
                model="-",
                requested=0,
                status="done",
                finished_at=utcnow(),
            )
            session.add(run)
            session.flush()
        return run.id

    def create_card(self, question_id: int) -> CardCreated:
        """Create (once) the approved card that revisits a question answered wrongly."""
        with self._sessions() as session:
            question = session.get(Item, question_id)
            if question is None or question.kind != "question":
                raise ItemNotFound(f"Não existe questão com id {question_id}.")
            if question.status != "approved":
                raise ValidationFailed("Só questões aprovadas têm caderno de erros.")
            existing = session.scalars(
                select(Item.id).where(Item.origin_item_id == question_id).limit(1)
            ).first()
            if existing is not None:
                return CardCreated(int(existing), created=False)
            missed = session.scalar(
                select(func.count(Attempt.id)).where(
                    Attempt.item_id == question_id, Attempt.correct.is_(False)
                )
            )
            if not missed:
                raise ValidationFailed("Só é possível virar card uma questão que você errou.")
            subtype, front, back = error_card_text(
                question.subtype, json.loads(question.payload_json)
            )
            card = Item(
                run_id=self._run_id(session),
                kind="card",
                subtype=subtype,
                payload_json=json.dumps({"front": front, "back": back}, ensure_ascii=False),
                status="approved",
                topic_id=question.topic_id,
                chunk_id=question.chunk_id,
                source_title=question.source_title,
                source_page=question.source_page,
                quote=question.quote,
                origin=ERROR_NOTE,
                origin_item_id=question_id,
                approved_at=utcnow(),
            )
            session.add(card)
            session.commit()
            return CardCreated(card.id, created=True)

    def card_for(self, question_id: int) -> int | None:
        """The id of the error card already made from this question, if any."""
        with self._sessions() as session:
            found = session.scalars(
                select(Item.id).where(Item.origin_item_id == question_id).limit(1)
            ).first()
            return int(found) if found is not None else None

    def entries(self, topic_id: int | None = None) -> list[ErrorEntry]:
        """Error cards from questions plus cards rated "Errei" at least once, newest first."""
        with self._sessions() as session:
            failures = {
                int(item_id): (int(count), last)
                for item_id, count, last in session.execute(
                    select(ReviewLog.item_id, func.count(), func.max(ReviewLog.reviewed_at))
                    .where(ReviewLog.rating == 1)
                    .group_by(ReviewLog.item_id)
                )
            }
            query = (
                select(Item, Topic.name)
                .outerjoin(Topic, Topic.id == Item.topic_id)
                .where(
                    Item.kind == "card",
                    Item.status == "approved",
                    (Item.origin == ERROR_NOTE) | Item.id.in_(failures.keys() or [0]),
                )
            )
            if topic_id is not None:
                query = query.where(Item.topic_id == topic_id)
            entries = []
            for item, topic in session.execute(query).all():
                count, last = failures.get(item.id, (0, None))
                payload = json.loads(item.payload_json)
                entries.append(
                    ErrorEntry(
                        item_id=item.id,
                        front=str(payload.get("front", "")),
                        topic=topic,
                        source_title=item.source_title,
                        source_page=item.source_page,
                        from_question=item.origin == ERROR_NOTE,
                        failures=count,
                        last_error_at=last or item.created_at,
                    )
                )
        return sorted(entries, key=lambda e: (e.last_error_at, e.item_id), reverse=True)

    def counts(self) -> ErrorCounts:
        entries = self.entries()
        return ErrorCounts(
            total=len(entries),
            from_questions=sum(1 for e in entries if e.from_question),
            failed_cards=sum(1 for e in entries if e.failures > 0),
        )


class NotebookFactory:
    """Builds the `ErrorNotebook` of a workspace on demand."""

    def __init__(self, registry: WorkspaceRegistry) -> None:
        self._registry = registry

    def for_workspace(self, workspace_id: int) -> ErrorNotebook:
        return ErrorNotebook(self._registry.open(workspace_id).sessions)
