# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The study queue: what to show next, rating a card, undo and the day's numbers."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime, tzinfo

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import (
    CardState,
    GenerationRun,
    Item,
    Material,
    Meta,
    ReviewLog,
    Topic,
)
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
from mind.workspaces.registry import WorkspaceRegistry

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
class StudyFilter:
    """What to study in a session. `None` means "no restriction" for that dimension."""

    kind: str | None = None  # "card" or "question"
    topic_id: int | None = None
    material_id: int | None = None
    subtype: str | None = None

    @property
    def is_empty(self) -> bool:
        return self == StudyFilter()

    def params(self) -> dict[str, str]:
        """The non-empty fields as strings (used to carry the filter between requests)."""
        values = {
            "kind": self.kind,
            "topic": self.topic_id,
            "material": self.material_id,
            "subtype": self.subtype,
        }
        return {key: str(value) for key, value in values.items() if value is not None}

    def conditions(self) -> list[ColumnElement[bool]]:
        found: list[ColumnElement[bool]] = [
            Item.status == "approved",
            Item.kind == (self.kind or "card"),
        ]
        if self.topic_id is not None:
            found.append(Item.topic_id == self.topic_id)
        if self.subtype is not None:
            found.append(Item.subtype == self.subtype)
        if self.material_id is not None:
            found.append(
                Item.run_id.in_(
                    select(GenerationRun.id).where(GenerationRun.material_id == self.material_id)
                )
            )
        return found


@dataclass(frozen=True)
class Facet:
    key: int | str
    label: str
    count: int


@dataclass(frozen=True)
class StudyFacets:
    """The options of the study selector, each with how many approved items it holds."""

    topics: list[Facet]
    materials: list[Facet]
    subtypes: list[Facet]
    cards: int
    questions: int


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

    def counts(
        self, now: datetime | None = None, selection: StudyFilter | None = None
    ) -> TodayCounts:
        moment = now or self._clock()
        end = day_end(moment, self._tz)
        ahead = moment + LEARN_AHEAD
        day = self._today(moment)
        wanted = (selection or StudyFilter()).conditions()
        with self._sessions() as session:
            learning = session.scalar(
                select(func.count()).select_from(CardState).join(Item, Item.id == CardState.item_id)
                .where(*wanted, CardState.state.in_(LEARNING_STATES), CardState.due <= ahead)
            )  # fmt: skip
            review = session.scalar(
                select(func.count()).select_from(CardState).join(Item, Item.id == CardState.item_id)
                .where(*wanted, CardState.state == REVIEW_STATE, CardState.due <= end)
            )  # fmt: skip
            unseen = session.scalar(
                select(func.count(Item.id)).where(*wanted, ~Item.id.in_(select(CardState.item_id)))
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

    def queue(
        self,
        limit: int = 20,
        now: datetime | None = None,
        selection: StudyFilter | None = None,
    ) -> list[StudyCard]:
        """Upcoming cards: due learning cards, reviews due today, then new cards in the quota."""
        moment = now or self._clock()
        end = day_end(moment, self._tz)
        ahead = moment + LEARN_AHEAD
        cards: list[StudyCard] = []
        wanted = (selection or StudyFilter()).conditions()
        with self._sessions() as session:
            for states, cutoff in ((LEARNING_STATES, ahead), ((REVIEW_STATE,), end)):
                remaining = limit - len(cards)
                if remaining <= 0:
                    break
                rows = session.scalars(
                    select(CardState).join(Item, Item.id == CardState.item_id)
                    .where(*wanted, CardState.state.in_(states), CardState.due <= cutoff)
                    .order_by(CardState.due).limit(remaining)
                ).all()  # fmt: skip
                cards.extend(
                    StudyCard(self._review.get(r.item_id), self._schedule(r)) for r in rows
                )
            allowance = self.settings().new_per_day - self._new_studied_today(
                session, self._today(moment)
            )
            room = min(limit - len(cards), allowance)
            if room > 0:
                fresh = session.scalars(
                    select(Item).where(*wanted, ~Item.id.in_(select(CardState.item_id)))
                    .order_by(Item.approved_at, Item.id).limit(room)
                ).all()  # fmt: skip
                cards.extend(StudyCard(self._review.get(i.id), None) for i in fresh)
        return cards

    def next_card(
        self, now: datetime | None = None, selection: StudyFilter | None = None
    ) -> StudyCard | None:
        """The next card to study, or `None` when the session is over."""
        upcoming = self.queue(1, now, selection)
        return upcoming[0] if upcoming else None

    def facets(self) -> StudyFacets:
        """Selector options with the number of approved items behind each one."""
        approved = (Item.status == "approved", Item.kind == "card")
        with self._sessions() as session:
            topics = session.execute(
                select(Topic.id, Topic.name, func.count(Item.id))
                .join(Item, Item.topic_id == Topic.id)
                .where(*approved)
                .group_by(Topic.id)
                .order_by(Topic.name)
            ).all()
            materials = session.execute(
                select(Material.id, Material.title, func.count(Item.id))
                .join(GenerationRun, GenerationRun.material_id == Material.id)
                .join(Item, Item.run_id == GenerationRun.id)
                .where(*approved)
                .group_by(Material.id)
                .order_by(Material.title)
            ).all()
            subtypes = session.execute(
                select(Item.subtype, func.count(Item.id))
                .where(*approved)
                .group_by(Item.subtype)
                .order_by(Item.subtype)
            ).all()
            cards = session.scalar(select(func.count(Item.id)).where(*approved))
            questions = session.scalar(
                select(func.count(Item.id)).where(
                    Item.status == "approved", Item.kind == "question"
                )
            )
        return StudyFacets(
            topics=[Facet(i, str(n), int(c)) for i, n, c in topics],
            materials=[Facet(i, str(n), int(c)) for i, n, c in materials],
            subtypes=[Facet(str(s), str(s), int(c)) for s, c in subtypes],
            cards=int(cards or 0),
            questions=int(questions or 0),
        )

    def card(self, item_id: int) -> StudyCard:
        """A specific card with its current state (used after an undo)."""
        with self._sessions() as session:
            row = session.get(CardState, item_id)
            schedule = self._schedule(row) if row else None
        return StudyCard(self._review.get(item_id), schedule)

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


class StudyFactory:
    """Builds the `StudyService` of a workspace on demand."""

    def __init__(self, registry: WorkspaceRegistry) -> None:
        self._registry = registry

    def for_workspace(self, workspace_id: int) -> StudyService:
        return StudyService(self._registry.open(workspace_id).sessions)
