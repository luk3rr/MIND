# Filename: test_scheduler.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from datetime import UTC, datetime, timedelta, timezone

import pytest

from mind.study.formatting import format_interval
from mind.study.scheduler import Rating, Scheduler, study_day

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
BRT = timezone(timedelta(hours=-3))


@pytest.fixture
def scheduler() -> Scheduler:
    return Scheduler(enable_fuzzing=False)


def test_a_new_card_rated_good_enters_learning_with_a_short_step(scheduler: Scheduler) -> None:
    state = scheduler.review(None, Rating.GOOD, NOW)
    assert state.state == 1  # learning
    assert state.reps == 1
    assert state.lapses == 0
    assert timedelta(minutes=1) <= state.due - NOW <= timedelta(minutes=10)


def test_good_twice_graduates_the_card_to_a_day_scale_review(scheduler: Scheduler) -> None:
    first = scheduler.review(None, Rating.GOOD, NOW)
    second = scheduler.review(first, Rating.GOOD, first.due)
    assert second.state == 2  # review
    assert second.due - first.due >= timedelta(days=1)


def test_easy_graduates_immediately_and_later_than_good(scheduler: Scheduler) -> None:
    easy = scheduler.review(None, Rating.EASY, NOW)
    good = scheduler.review(
        scheduler.review(None, Rating.GOOD, NOW), Rating.GOOD, NOW + timedelta(minutes=10)
    )
    assert easy.state == 2
    assert easy.due - NOW > good.due - (NOW + timedelta(minutes=10))


def test_again_on_a_review_card_is_a_lapse_and_returns_to_relearning(scheduler: Scheduler) -> None:
    review = scheduler.review(None, Rating.EASY, NOW)
    lapsed = scheduler.review(review, Rating.AGAIN, review.due)
    assert lapsed.lapses == 1
    assert lapsed.state == 3  # relearning
    assert lapsed.due - review.due <= timedelta(minutes=10)
    assert lapsed.reps == 2


def test_again_on_a_new_card_is_not_a_lapse(scheduler: Scheduler) -> None:
    assert scheduler.review(None, Rating.AGAIN, NOW).lapses == 0


def test_preview_orders_the_intervals_and_changes_nothing(scheduler: Scheduler) -> None:
    graduated = scheduler.review(None, Rating.EASY, NOW)
    when = graduated.due
    before = graduated.fsrs_json
    preview = scheduler.preview(graduated, when)
    assert (
        preview[Rating.AGAIN] < preview[Rating.HARD] < preview[Rating.GOOD] < preview[Rating.EASY]
    )
    assert graduated.fsrs_json == before
    new_preview = scheduler.preview(None, NOW)
    assert set(new_preview) == set(Rating)
    assert all(span >= timedelta(0) for span in new_preview.values())


def test_state_survives_a_json_roundtrip(scheduler: Scheduler) -> None:
    state = scheduler.review(None, Rating.GOOD, NOW)
    again = scheduler.review(state, Rating.GOOD, state.due)
    assert again.fsrs_json != state.fsrs_json
    assert scheduler.review(state, Rating.GOOD, state.due) == again


def test_higher_retention_gives_shorter_intervals() -> None:
    low = Scheduler(0.8, enable_fuzzing=False)
    high = Scheduler(0.97, enable_fuzzing=False)
    spans = []
    for scheduler in (low, high):
        state = scheduler.review(None, Rating.EASY, NOW)
        for _ in range(3):
            state = scheduler.review(state, Rating.GOOD, state.due)
        spans.append(state.due)
    assert spans[0] > spans[1]


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (datetime(2026, 11, 14, 3, 59, tzinfo=BRT), "2026-11-13"),
        (datetime(2026, 11, 14, 4, 0, tzinfo=BRT), "2026-11-14"),
        (datetime(2026, 11, 14, 23, 59, tzinfo=BRT), "2026-11-14"),
        (datetime(2026, 11, 15, 0, 30, tzinfo=BRT), "2026-11-14"),
        (datetime(2026, 11, 15, 2, 0, tzinfo=UTC), "2026-11-14"),  # 23:00 in BRT
    ],
)
def test_the_study_day_turns_over_at_four_in_the_morning(moment: datetime, expected: str) -> None:
    assert study_day(moment, BRT) == expected


@pytest.mark.parametrize(
    ("seconds", "label"),
    [
        (5, "< 1 min"),
        (60, "1 min"),
        (600, "10 min"),
        (3 * 3600, "3 h"),
        (3 * 86_400, "3 d"),
        (45 * 86_400, "2 meses"),
        (30 * 86_400, "1 mês"),
        (540 * 86_400, "1,5 anos"),
        (-10, "< 1 min"),
    ],
)
def test_interval_labels(seconds: int, label: str) -> None:
    assert format_interval(timedelta(seconds=seconds)) == label
