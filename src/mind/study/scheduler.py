# Filename: scheduler.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""FSRS scheduling behind a small interface of our own (design ADR-7)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, tzinfo
from enum import IntEnum

from fsrs import Card
from fsrs import Rating as FsrsRating
from fsrs import Scheduler as FsrsScheduler

DAY_ROLLOVER_HOUR = 4
LEARN_AHEAD = timedelta(minutes=20)
REVIEW_STATE = 2  # fsrs.State.Review


class Rating(IntEnum):
    AGAIN = 1
    HARD = 2
    GOOD = 3
    EASY = 4


@dataclass(frozen=True)
class CardSchedule:
    """Scheduling state of one card, ready to be stored."""

    fsrs_json: str
    due: datetime
    state: int
    reps: int
    lapses: int


def study_day(
    moment: datetime, tz: tzinfo | None = None, rollover_hour: int = DAY_ROLLOVER_HOUR
) -> str:
    """The study day (ISO date) a moment belongs to; the day turns over at `rollover_hour`."""
    local = moment.astimezone(tz)
    shifted = local - timedelta(hours=rollover_hour)
    return date(shifted.year, shifted.month, shifted.day).isoformat()


class Scheduler:
    def __init__(self, desired_retention: float = 0.9, *, enable_fuzzing: bool = True) -> None:
        self._fsrs = FsrsScheduler(
            desired_retention=desired_retention, enable_fuzzing=enable_fuzzing
        )

    def _card(self, state: CardSchedule | None, now: datetime) -> Card:
        if state is None:
            card = Card()
            card.due = now
            return card
        return Card.from_json(state.fsrs_json)

    def review(self, state: CardSchedule | None, rating: Rating, now: datetime) -> CardSchedule:
        """Apply a rating and return the new state (the input is never modified)."""
        card = self._card(state, now)
        was_review = card.state.value == REVIEW_STATE
        updated, _log = self._fsrs.review_card(card, FsrsRating(int(rating)), now.astimezone(UTC))
        reps = (state.reps if state else 0) + 1
        lapses = (state.lapses if state else 0) + (
            1 if rating == Rating.AGAIN and was_review else 0
        )
        return CardSchedule(
            fsrs_json=updated.to_json(),
            due=updated.due,
            state=updated.state.value,
            reps=reps,
            lapses=lapses,
        )

    def preview(self, state: CardSchedule | None, now: datetime) -> dict[Rating, timedelta]:
        """How long until the card is due again for each rating, without saving anything."""
        result: dict[Rating, timedelta] = {}
        for rating in Rating:
            updated = self.review(state, rating, now)
            result[rating] = max(updated.due - now, timedelta(0))
        return result
