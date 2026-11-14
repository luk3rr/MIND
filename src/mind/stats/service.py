# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Statistics: accuracy by topic, retention, daily goal and streak."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import Attempt, Item, ReviewLog, Topic
from mind.study.scheduler import study_day
from mind.study.service import StudyService

MIN_EVENTS = 5  # below this a topic's accuracy is flagged as a small sample
REVIEW_STATE = 2


@dataclass(frozen=True)
class TopicStat:
    topic_id: int | None
    name: str | None  # None for items without a topic
    card_reviews: int
    card_passes: int
    question_attempts: int
    question_correct: int

    @property
    def events(self) -> int:
        return self.card_reviews + self.question_attempts

    @property
    def accuracy(self) -> float | None:
        return (self.card_passes + self.question_correct) / self.events if self.events else None

    @property
    def card_accuracy(self) -> float | None:
        return self.card_passes / self.card_reviews if self.card_reviews else None

    @property
    def question_accuracy(self) -> float | None:
        return self.question_correct / self.question_attempts if self.question_attempts else None

    @property
    def small_sample(self) -> bool:
        return self.events < MIN_EVENTS


@dataclass(frozen=True)
class RetentionDay:
    day: str
    reviews: int
    passes: int

    @property
    def rate(self) -> float | None:
        return self.passes / self.reviews if self.reviews else None


@dataclass(frozen=True)
class Retention:
    days: list[RetentionDay]

    @property
    def reviews(self) -> int:
        return sum(d.reviews for d in self.days)

    @property
    def rate(self) -> float | None:
        reviews = self.reviews
        return sum(d.passes for d in self.days) / reviews if reviews else None


@dataclass(frozen=True)
class ActivityDay:
    day: str
    reviews: int
    attempts: int

    @property
    def total(self) -> int:
        return self.reviews + self.attempts


@dataclass(frozen=True)
class StatsSummary:
    reviewed_today: int
    answered_today: int
    goal: int
    current_streak: int
    longest_streak: int
    total_reviews: int
    total_attempts: int

    @property
    def activity_today(self) -> int:
        return self.reviewed_today + self.answered_today

    @property
    def goal_met(self) -> bool:
        return self.reviewed_today >= self.goal


def _streaks(days: set[str], today: str) -> tuple[int, int]:
    """(current, longest) streak of consecutive study days with activity."""
    parsed = sorted(date.fromisoformat(d) for d in days)
    longest = run = 0
    previous: date | None = None
    for current_day in parsed:
        run = run + 1 if previous and current_day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = current_day
    cursor = date.fromisoformat(today)
    if today not in days:
        cursor -= timedelta(days=1)  # today is not over yet, so it does not break the streak
    current = 0
    while cursor.isoformat() in days:
        current += 1
        cursor -= timedelta(days=1)
    return current, longest


class StatsService:
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
        self._study = StudyService(sessions, clock=clock, tz=tz)

    def _today(self, now: datetime | None) -> str:
        return study_day(now or self._clock(), self._tz)

    def topic_stats(self) -> list[TopicStat]:
        """Accuracy per topic from card ratings and question attempts (approved items only)."""
        with self._sessions() as session:
            cards = {
                topic_id: (int(total), int(passed or 0))
                for topic_id, total, passed in session.execute(
                    select(
                        Item.topic_id,
                        func.count(ReviewLog.id),
                        func.sum(cast(ReviewLog.rating >= 2, Integer)),
                    )
                    .join(Item, Item.id == ReviewLog.item_id)
                    .where(Item.status == "approved", Item.kind == "card")
                    .group_by(Item.topic_id)
                )
            }
            questions = {
                topic_id: (int(total), int(right or 0))
                for topic_id, total, right in session.execute(
                    select(
                        Item.topic_id,
                        func.count(Attempt.id),
                        func.sum(cast(Attempt.correct, Integer)),
                    )
                    .join(Item, Item.id == Attempt.item_id)
                    .where(Item.status == "approved", Item.kind == "question")
                    .group_by(Item.topic_id)
                )
            }
            names = {t.id: t.name for t in session.scalars(select(Topic))}
            with_items = {
                int(i)
                for i in session.scalars(
                    select(Item.topic_id).where(
                        Item.status == "approved", Item.topic_id.is_not(None)
                    )
                )
                if i is not None
            }
        keys = set(cards) | set(questions) | with_items
        stats = []
        for key in keys:
            reviews, passes = cards.get(key, (0, 0))
            attempts, right = questions.get(key, (0, 0))
            stats.append(
                TopicStat(
                    topic_id=key,
                    name=names.get(key) if key is not None else None,
                    card_reviews=reviews,
                    card_passes=passes,
                    question_attempts=attempts,
                    question_correct=right,
                )
            )
        return sorted(stats, key=lambda s: ((s.name is None), (s.name or "").lower()))

    def weakest_topics(self, limit: int = 5, min_events: int = MIN_EVENTS) -> list[TopicStat]:
        """Topics with the lowest accuracy among those with enough events."""
        eligible = [
            s for s in self.topic_stats() if s.topic_id is not None and s.events >= min_events
        ]
        return sorted(eligible, key=lambda s: (s.accuracy or 0.0, s.name or ""))[:limit]

    def retention(self, days: int = 30, now: datetime | None = None) -> Retention:
        """Share of reviews of mature cards (already in review) rated "Hard" or better."""
        today = date.fromisoformat(self._today(now))
        first = today - timedelta(days=days - 1)
        with self._sessions() as session:
            logs = session.execute(
                select(ReviewLog.day, ReviewLog.rating, ReviewLog.previous_state_json).where(
                    ReviewLog.day >= first.isoformat(), ReviewLog.previous_state_json.is_not(None)
                )
            ).all()
        totals: dict[str, list[int]] = {}
        for day, rating, previous in logs:
            if previous is None or json.loads(previous).get("state") != REVIEW_STATE:
                continue
            entry = totals.setdefault(day, [0, 0])
            entry[0] += 1
            entry[1] += 1 if rating >= 2 else 0
        series = [
            RetentionDay(
                (first + timedelta(days=i)).isoformat(),
                *totals.get((first + timedelta(days=i)).isoformat(), [0, 0]),
            )
            for i in range(days)
        ]
        return Retention(series)

    def activity(self, days: int = 30, now: datetime | None = None) -> list[ActivityDay]:
        today = date.fromisoformat(self._today(now))
        first = today - timedelta(days=days - 1)
        with self._sessions() as session:
            reviews = dict(
                session.execute(
                    select(ReviewLog.day, func.count())
                    .where(ReviewLog.day >= first.isoformat())
                    .group_by(ReviewLog.day)
                ).all()
            )
            attempts = dict(
                session.execute(
                    select(Attempt.day, func.count())
                    .where(Attempt.day >= first.isoformat())
                    .group_by(Attempt.day)
                ).all()
            )
        out = []
        for i in range(days):
            day = (first + timedelta(days=i)).isoformat()
            out.append(ActivityDay(day, int(reviews.get(day, 0)), int(attempts.get(day, 0))))
        return out

    def summary(self, now: datetime | None = None) -> StatsSummary:
        today = self._today(now)
        with self._sessions() as session:
            reviewed = int(
                session.scalar(select(func.count(ReviewLog.id)).where(ReviewLog.day == today)) or 0
            )
            answered = int(
                session.scalar(select(func.count(Attempt.id)).where(Attempt.day == today)) or 0
            )
            total_reviews = int(session.scalar(select(func.count(ReviewLog.id))) or 0)
            total_attempts = int(session.scalar(select(func.count(Attempt.id))) or 0)
            days = {str(d) for d in session.scalars(select(ReviewLog.day).distinct())}
            days |= {str(d) for d in session.scalars(select(Attempt.day).distinct())}
        current, longest = _streaks(days, today)
        return StatsSummary(
            reviewed_today=reviewed,
            answered_today=answered,
            goal=self._study.settings().daily_goal,
            current_streak=current,
            longest_streak=longest,
            total_reviews=total_reviews,
            total_attempts=total_attempts,
        )
