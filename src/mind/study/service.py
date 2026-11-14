# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The study queue: what to show next, rating a card, undo and the day's numbers."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime, tzinfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import CardState, Item, Meta, ReviewLog
from mind.errors import FieldError, ItemNotFound, ValidationFailed
from mind.review.service import ItemInfo, ReviewService
from mind.study.formatting import format_interval
from mind.study.scheduler import (
    LEARN_AHEAD,
    CardSchedule,
    Rating,
    Scheduler,
    day_end,
    study_day,
)

LEARNING_STATES = (1, 3)  # learning and relearning
REVIEW_STATE = 2
DEFAULTS = {"new_per_day": "20", "daily_goal": "40", "desired_retention": "0.9"}
MAX_NEW_PER_DAY = 500
MAX_DAILY_GOAL = 2000


@dataclass(frozen=True)
class StudySettings:
    new_per_day: int
    daily_goal: int
    desired_retention: float


@dataclass(frozen=True)
class StudyCard:
    item: ItemInfo
    schedule: CardSchedule | None

    @property
    def is_new(self) -> bool:
        return self.schedule is None


@dataclass(frozen=True)
class TodayCounts:
    learning: int
    review: int
    new_available: int
    reviewed_today: int
    new_studied_today: int

    @property
    def to_study(self) -> int:
        return self.learning + self.review + self.new_available


class StudyService:
    def __init__(
        self,
        sessions: sessionmaker[Session],
        *,
        scheduler: Scheduler | None = None,
        clock: Callable[[], datetime] = utcnow,
        tz: tzinfo | None = None,
    ) -> None:
        self._sessions = sessions
        self._scheduler = scheduler
        self._clock = clock
        self._tz = tz
        self._review = ReviewService(sessions)

    # settings -----------------------------------------------------------------------------

    def settings(self) -> StudySettings:
        with self._sessions() as session:
            stored = {m.key: m.value for m in session.scalars(select(Meta))}
        merged = {**DEFAULTS, **stored}
        return StudySettings(
            new_per_day=int(merged["new_per_day"]),
            daily_goal=int(merged["daily_goal"]),
            desired_retention=float(merged["desired_retention"]),
        )

    def update_settings(
        self,
        *,
        new_per_day: int | None = None,
        daily_goal: int | None = None,
        desired_retention: float | None = None,
    ) -> StudySettings:
        changes: dict[str, str] = {}
        errors: list[FieldError] = []
        if new_per_day is not None:
            if 0 <= new_per_day <= MAX_NEW_PER_DAY:
                changes["new_per_day"] = str(new_per_day)
            else:
                errors.append(FieldError("new_per_day", f"Use de 0 a {MAX_NEW_PER_DAY}."))
        if daily_goal is not None:
            if 1 <= daily_goal <= MAX_DAILY_GOAL:
                changes["daily_goal"] = str(daily_goal)
            else:
                errors.append(FieldError("daily_goal", f"Use de 1 a {MAX_DAILY_GOAL}."))
        if desired_retention is not None:
            if 0.7 <= desired_retention <= 0.99:
                changes["desired_retention"] = str(desired_retention)
            else:
                errors.append(FieldError("desired_retention", "Use de 0,70 a 0,99."))
        if errors:
            raise ValidationFailed("Configurações de estudo inválidas.", errors=errors)
        with self._sessions() as session:
            for key, value in changes.items():
                session.merge(Meta(key=key, value=value))
            session.commit()
        return self.settings()

    def _scheduler_for(self) -> Scheduler:
        return self._scheduler or Scheduler(self.settings().desired_retention)

    # reading state ------------------------------------------------------------------------

    @staticmethod
    def _schedule(row: CardState) -> CardSchedule:
        return CardSchedule(row.fsrs_json, row.due, row.state, row.reps, row.lapses)

    def _today(self, now: datetime) -> str:
        return study_day(now, self._tz)

    def _new_studied_today(self, session: Session, day: str) -> int:
        return int(
            session.scalar(
                select(func.count(ReviewLog.id)).where(
                    ReviewLog.day == day, ReviewLog.previous_state_json.is_(None)
                )
            )
            or 0
        )

    def counts(self, now: datetime | None = None) -> TodayCounts:
        moment = now or self._clock()
        end = day_end(moment, self._tz)
        ahead = moment + LEARN_AHEAD
        day = self._today(moment)
        with self._sessions() as session:
            approved = (Item.status == "approved") & (Item.kind == "card")
            learning = session.scalar(
                select(func.count()).select_from(CardState).join(Item, Item.id == CardState.item_id)
                .where(approved, CardState.state.in_(LEARNING_STATES), CardState.due <= ahead)
            )  # fmt: skip
            review = session.scalar(
                select(func.count()).select_from(CardState).join(Item, Item.id == CardState.item_id)
                .where(approved, CardState.state == REVIEW_STATE, CardState.due <= end)
            )  # fmt: skip
            unseen = session.scalar(
                select(func.count(Item.id)).where(approved, ~Item.id.in_(select(CardState.item_id)))
            )
            new_today = self._new_studied_today(session, day)
            reviewed = session.scalar(select(func.count(ReviewLog.id)).where(ReviewLog.day == day))
        allowance = max(self.settings().new_per_day - new_today, 0)
        return TodayCounts(
            learning=int(learning or 0),
            review=int(review or 0),
            new_available=min(int(unseen or 0), allowance),
            reviewed_today=int(reviewed or 0),
            new_studied_today=new_today,
        )

    def next_card(self, now: datetime | None = None) -> StudyCard | None:
        """The next card: due learning cards, then reviews due today, then new cards."""
        moment = now or self._clock()
        end = day_end(moment, self._tz)
        ahead = moment + LEARN_AHEAD
        with self._sessions() as session:
            approved = (Item.status == "approved") & (Item.kind == "card")
            row = session.scalars(
                select(CardState).join(Item, Item.id == CardState.item_id)
                .where(approved, CardState.state.in_(LEARNING_STATES), CardState.due <= ahead)
                .order_by(CardState.due).limit(1)
            ).first()  # fmt: skip
            if row is None:
                row = session.scalars(
                    select(CardState).join(Item, Item.id == CardState.item_id)
                    .where(approved, CardState.state == REVIEW_STATE, CardState.due <= end)
                    .order_by(CardState.due).limit(1)
                ).first()  # fmt: skip
            if row is not None:
                return StudyCard(self._review.get(row.item_id), self._schedule(row))
            if self._new_studied_today(session, self._today(moment)) >= self.settings().new_per_day:
                return None
            fresh = session.scalars(
                select(Item).where(approved, ~Item.id.in_(select(CardState.item_id)))
                .order_by(Item.approved_at, Item.id).limit(1)
            ).first()  # fmt: skip
            if fresh is None:
                return None
            return StudyCard(self._review.get(fresh.id), None)

    def previews(self, card: StudyCard, now: datetime | None = None) -> dict[Rating, str]:
        moment = now or self._clock()
        spans = self._scheduler_for().preview(card.schedule, moment)
        return {rating: format_interval(span) for rating, span in spans.items()}

    # changing state -----------------------------------------------------------------------

    def rate(
        self,
        item_id: int,
        rating: Rating,
        *,
        now: datetime | None = None,
        duration_ms: int | None = None,
    ) -> CardSchedule:
        moment = now or self._clock()
        scheduler = self._scheduler_for()
        with self._sessions() as session:
            item = session.get(Item, item_id)
            if item is None:
                raise ItemNotFound(f"Não existe item com id {item_id}.")
            if item.status != "approved" or item.kind != "card":
                raise ValidationFailed("Só cards aprovados podem ser estudados.")
            row = session.get(CardState, item_id)
            previous = self._schedule(row) if row else None
            updated = scheduler.review(previous, rating, moment)
            if row is None:
                session.add(
                    CardState(
                        item_id=item_id,
                        fsrs_json=updated.fsrs_json,
                        due=updated.due,
                        state=updated.state,
                        reps=updated.reps,
                        lapses=updated.lapses,
                        updated_at=moment,
                    )
                )
            else:
                row.fsrs_json, row.due = updated.fsrs_json, updated.due
                row.state, row.reps, row.lapses = updated.state, updated.reps, updated.lapses
                row.updated_at = moment
            session.add(
                ReviewLog(
                    item_id=item_id,
                    rating=int(rating),
                    reviewed_at=moment,
                    previous_state_json=_dump(previous),
                    duration_ms=duration_ms,
                    day=self._today(moment),
                )
            )
            session.commit()
        return updated

    def undo(self) -> int | None:
        """Revert the most recent rating. Return the item id, or `None` if nothing to undo."""
        with self._sessions() as session:
            log = session.scalars(select(ReviewLog).order_by(ReviewLog.id.desc()).limit(1)).first()
            if log is None:
                return None
            row = session.get(CardState, log.item_id)
            if log.previous_state_json is None:
                if row is not None:
                    session.delete(row)
            elif row is not None:
                saved = json.loads(log.previous_state_json)
                previous = CardSchedule(**{**saved, "due": datetime.fromisoformat(saved["due"])})
                row.fsrs_json, row.due = previous.fsrs_json, previous.due
                row.state, row.reps, row.lapses = previous.state, previous.reps, previous.lapses
            item_id = log.item_id
            session.delete(log)
            session.commit()
            return item_id

    def rating_distribution(self, day: str | None = None) -> dict[int, int]:
        target = day or self._today(self._clock())
        with self._sessions() as session:
            rows = session.execute(
                select(ReviewLog.rating, func.count())
                .where(ReviewLog.day == target)
                .group_by(ReviewLog.rating)
            ).all()
        return {int(rating): int(count) for rating, count in rows}


def _dump(state: CardSchedule | None) -> str | None:
    if state is None:
        return None
    data = asdict(state)
    data["due"] = state.due.isoformat()
    return json.dumps(data)
