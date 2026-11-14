# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The question practice queue and the recording of answers."""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, tzinfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import Attempt, Item
from mind.errors import FieldError, ItemNotFound, ValidationFailed
from mind.review.service import ItemInfo, ReviewService
from mind.study.scheduler import study_day
from mind.study.service import StudyFilter
from mind.workspaces.registry import WorkspaceRegistry


@dataclass(frozen=True)
class PracticeQuestion:
    item: ItemInfo
    attempts: int
    last_correct: bool | None  # None while the question has never been answered


@dataclass(frozen=True)
class AnswerResult:
    correct: bool
    answer: str
    correct_key: str
    explanation: str
    options: list[dict[str, str]]
    attempt_id: int


@dataclass(frozen=True)
class PracticeCounts:
    unseen: int
    retry: int
    answered_today: int
    correct_today: int

    @property
    def to_practice(self) -> int:
        return self.unseen + self.retry


class PracticeService:
    def __init__(
        self,
        sessions: sessionmaker[Session],
        *,
        clock: Callable[[], datetime] = utcnow,
        tz: tzinfo | None = None,
    ) -> None:
        self._sessions = sessions
        self._clock = clock
        self._tz = tz
        self._review = ReviewService(sessions)

    @staticmethod
    def _selection(selection: StudyFilter | None) -> StudyFilter:
        return replace(selection or StudyFilter(), kind="question")

    def _last_attempts(self, session: Session) -> dict[int, tuple[int, bool, int]]:
        """item id -> (last attempt id, was it correct, number of attempts)."""
        latest = (
            select(Attempt.item_id, func.max(Attempt.id).label("last_id"), func.count().label("n"))
            .group_by(Attempt.item_id)
            .subquery()
        )
        rows = session.execute(
            select(latest.c.item_id, latest.c.last_id, Attempt.correct, latest.c.n).join(
                Attempt, Attempt.id == latest.c.last_id
            )
        ).all()
        return {int(r[0]): (int(r[1]), bool(r[2]), int(r[3])) for r in rows}

    def queue(
        self,
        limit: int = 20,
        selection: StudyFilter | None = None,
        *,
        redo: bool = False,
        exclude: Sequence[int] = (),
    ) -> list[PracticeQuestion]:
        """Never-answered questions first, then those answered wrongly last time (oldest first).

        With `redo`, questions answered correctly last time follow (oldest first)."""
        wanted = self._selection(selection).conditions()
        with self._sessions() as session:
            approved = session.scalars(
                select(Item).where(*wanted).order_by(Item.approved_at, Item.id)
            ).all()
            history = self._last_attempts(session)
        unseen: list[Item] = []
        wrong: list[tuple[int, Item]] = []
        right: list[tuple[int, Item]] = []
        for item in approved:
            if item.id in exclude:
                continue
            seen = history.get(item.id)
            if seen is None:
                unseen.append(item)
            elif not seen[1]:
                wrong.append((seen[0], item))
            elif redo:
                right.append((seen[0], item))
        ordered = [
            *unseen,
            *(i for _, i in sorted(wrong, key=_by_attempt)),
            *(i for _, i in sorted(right, key=_by_attempt)),
        ]
        return [
            PracticeQuestion(
                self._review.get(item.id),
                attempts=history[item.id][2] if item.id in history else 0,
                last_correct=history[item.id][1] if item.id in history else None,
            )
            for item in ordered[:limit]
        ]

    def next_question(
        self,
        selection: StudyFilter | None = None,
        *,
        redo: bool = False,
        exclude: Sequence[int] = (),
    ) -> PracticeQuestion | None:
        found = self.queue(1, selection, redo=redo, exclude=exclude)
        return found[0] if found else None

    def question(self, item_id: int) -> PracticeQuestion:
        item = self._review.get(item_id)
        if item.kind != "question":
            raise ItemNotFound(f"Não existe questão com id {item_id}.")
        with self._sessions() as session:
            seen = self._last_attempts(session).get(item_id)
        return PracticeQuestion(item, seen[2] if seen else 0, seen[1] if seen else None)

    def counts(
        self, selection: StudyFilter | None = None, now: datetime | None = None
    ) -> PracticeCounts:
        wanted = self._selection(selection).conditions()
        today = study_day(now or self._clock(), self._tz)
        with self._sessions() as session:
            ids = [int(i) for i in session.scalars(select(Item.id).where(*wanted))]
            history = self._last_attempts(session)
            answered = int(
                session.scalar(select(func.count(Attempt.id)).where(Attempt.day == today)) or 0
            )
            correct = int(
                session.scalar(
                    select(func.count(Attempt.id)).where(Attempt.day == today, Attempt.correct)
                )
                or 0
            )
        return PracticeCounts(
            unseen=sum(1 for i in ids if i not in history),
            retry=sum(1 for i in ids if i in history and not history[i][1]),
            answered_today=answered,
            correct_today=correct,
        )

    def answer(
        self,
        item_id: int,
        answer: str,
        *,
        seconds: float | None = None,
        now: datetime | None = None,
    ) -> AnswerResult:
        moment = now or self._clock()
        with self._sessions() as session:
            item = session.get(Item, item_id)
            if item is None or item.kind != "question":
                raise ItemNotFound(f"Não existe questão com id {item_id}.")
            if item.status != "approved":
                raise ValidationFailed("Só questões aprovadas podem ser respondidas.")
            payload = json.loads(item.payload_json)
            keys = [str(o["key"]) for o in payload["options"]]
            if answer not in keys:
                raise ValidationFailed(
                    "Escolha uma das alternativas.",
                    errors=[FieldError("answer", f"Use uma destas: {', '.join(keys)}.")],
                )
            correct = answer == payload["answer"]
            attempt = Attempt(
                item_id=item_id,
                answer=answer,
                correct=correct,
                seconds=seconds,
                answered_at=moment,
                day=study_day(moment, self._tz),
            )
            session.add(attempt)
            session.commit()
            return AnswerResult(
                correct=correct,
                answer=answer,
                correct_key=str(payload["answer"]),
                explanation=str(payload["explanation"]),
                options=[dict(o) for o in payload["options"]],
                attempt_id=attempt.id,
            )


def _by_attempt(entry: tuple[int, Item]) -> int:
    return entry[0]


class PracticeFactory:
    """Builds the `PracticeService` of a workspace on demand."""

    def __init__(self, registry: WorkspaceRegistry) -> None:
        self._registry = registry

    def for_workspace(self, workspace_id: int) -> PracticeService:
        return PracticeService(self._registry.open(workspace_id).sessions)
