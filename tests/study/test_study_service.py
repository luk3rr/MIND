# Filename: test_study_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import CardState, GenerationRun, Item, ReviewLog
from mind.errors import ItemNotFound, ValidationFailed
from mind.study.scheduler import Rating, Scheduler
from mind.study.service import StudyService

BRT = timezone(timedelta(hours=-3))
NOON = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)  # 12:00 in BRT


def add_cards(
    sessions: sessionmaker[Session], count: int, *, status: str = "approved"
) -> list[int]:
    with sessions() as session:
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=count)
        session.add(run)
        session.flush()
        ids = []
        for number in range(count):
            item = Item(
                run_id=run.id,
                kind="card",
                subtype="qa",
                payload_json=json.dumps({"front": f"P{number}?", "back": "R"}),
                status=status,
                approved_at=NOON + timedelta(seconds=number) if status == "approved" else None,
            )
            session.add(item)
            session.flush()
            ids.append(item.id)
        session.commit()
        return ids


@pytest.fixture
def study(workspace_sessions: sessionmaker[Session]) -> StudyService:
    return StudyService(
        workspace_sessions, scheduler=Scheduler(enable_fuzzing=False), clock=lambda: NOON, tz=BRT
    )


def test_defaults_and_validated_updates(study: StudyService) -> None:
    assert (study.settings().new_per_day, study.settings().daily_goal) == (20, 40)
    assert study.settings().desired_retention == 0.9
    updated = study.update_settings(new_per_day=5, daily_goal=10, desired_retention=0.85)
    assert (updated.new_per_day, updated.daily_goal, updated.desired_retention) == (5, 10, 0.85)
    for bad in ({"new_per_day": -1}, {"daily_goal": 0}, {"desired_retention": 0.2}):
        with pytest.raises(ValidationFailed):
            study.update_settings(**bad)


def test_only_approved_cards_are_studied_and_new_ones_come_in_approval_order(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    add_cards(workspace_sessions, 2, status="draft")
    approved = add_cards(workspace_sessions, 3)
    card = study.next_card()
    assert card is not None
    assert (card.item.id, card.is_new) == (approved[0], True)
    assert study.counts().new_available == 3


def test_no_cards_means_no_session(study: StudyService) -> None:
    assert study.next_card() is None
    assert study.counts().to_study == 0


def test_rating_a_new_card_creates_state_and_a_log_and_moves_on(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    ids = add_cards(workspace_sessions, 2)
    study.rate(ids[0], Rating.GOOD, now=NOON, duration_ms=1500)

    with workspace_sessions() as session:
        state = session.get(CardState, ids[0])
        log = session.query(ReviewLog).one()
        assert state is not None
        assert (state.reps, state.state) == (1, 1)
        assert (log.rating, log.previous_state_json, log.duration_ms) == (3, None, 1500)
        assert log.day == "2026-11-14"
    # "Good" on a new card puts it ten minutes ahead, inside the learn-ahead window, so it
    # comes back before the next new card.
    again = study.next_card(NOON)
    assert again is not None
    assert (again.item.id, again.is_new) == (ids[0], False)
    study.rate(ids[0], Rating.EASY, now=NOON)
    nxt = study.next_card(NOON)
    assert nxt is not None
    assert nxt.item.id == ids[1]


def test_a_failed_card_comes_back_within_the_learn_ahead_window(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    [only] = add_cards(workspace_sessions, 1)
    study.rate(only, Rating.AGAIN, now=NOON)

    soon = study.next_card(NOON)
    assert soon is not None
    assert (soon.item.id, soon.is_new) == (only, False)
    assert study.counts(NOON).learning == 1


def test_learning_cards_come_first_then_reviews_due_today_then_new(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    review, learning, fresh = add_cards(workspace_sessions, 3)
    study.rate(review, Rating.EASY, now=NOON - timedelta(days=10))  # review card, long overdue
    study.rate(learning, Rating.AGAIN, now=NOON)
    order = []
    for _ in range(3):
        card = study.next_card(NOON)
        assert card is not None
        order.append(card.item.id)
        study.rate(card.item.id, Rating.EASY, now=NOON)
    assert order == [learning, review, fresh]


def test_review_cards_due_later_today_are_included_but_tomorrow_ones_are_not(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    [first] = add_cards(workspace_sessions, 1)
    # An "Easy" first review is scheduled 8 days ahead: this one falls due 2 hours from NOON.
    state = study.rate(first, Rating.EASY, now=NOON - timedelta(days=8) + timedelta(hours=2))
    assert state.due == NOON + timedelta(hours=2)
    assert study.counts(NOON).review == 1
    card = study.next_card(NOON)
    assert card is not None
    assert card.item.id == first

    study.rate(first, Rating.EASY, now=NOON)  # interval grows to many days
    assert study.next_card(NOON) is None
    assert study.counts(NOON).review == 0


def test_the_new_card_limit_is_per_study_day(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    study.update_settings(new_per_day=2)
    ids = add_cards(workspace_sessions, 5)
    for item_id in ids[:2]:
        study.rate(item_id, Rating.EASY, now=NOON)
    assert study.next_card(NOON) is None
    counts = study.counts(NOON)
    assert (counts.new_studied_today, counts.new_available, counts.reviewed_today) == (2, 0, 2)

    next_day = NOON + timedelta(days=1)
    card = study.next_card(next_day)
    assert card is not None
    assert card.item.id == ids[2]


def test_a_session_after_midnight_still_counts_for_the_same_study_day(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    study.update_settings(new_per_day=1)
    ids = add_cards(workspace_sessions, 3)
    late = datetime(2026, 11, 15, 5, 30, tzinfo=UTC)  # 02:30 in BRT, still the 14th
    study.rate(ids[0], Rating.EASY, now=NOON)
    assert study.next_card(late) is None


def test_undo_restores_the_previous_state_or_forgets_a_new_card(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    [only] = add_cards(workspace_sessions, 1)
    study.rate(only, Rating.GOOD, now=NOON)
    second = study.rate(only, Rating.GOOD, now=NOON + timedelta(minutes=10))
    assert second.state == 2

    assert study.undo() == only
    with workspace_sessions() as session:
        state = session.get(CardState, only)
        assert state is not None
        assert (state.state, state.reps) == (1, 1)

    assert study.undo() == only
    with workspace_sessions() as session:
        assert session.get(CardState, only) is None
        assert session.query(ReviewLog).count() == 0
    card = study.next_card(NOON)
    assert card is not None
    assert card.is_new
    assert study.undo() is None


def test_rating_requires_an_approved_card(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    [draft] = add_cards(workspace_sessions, 1, status="draft")
    with pytest.raises(ValidationFailed):
        study.rate(draft, Rating.GOOD)
    with pytest.raises(ItemNotFound):
        study.rate(999, Rating.GOOD)


def test_previews_label_each_rating_and_do_not_change_anything(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    add_cards(workspace_sessions, 1)
    card = study.next_card(NOON)
    assert card is not None
    labels = study.previews(card, NOON)
    assert set(labels) == set(Rating)
    assert labels[Rating.AGAIN] in {"1 min", "< 1 min"}
    assert workspace_sessions().__enter__().query(CardState).count() == 0


def test_rating_distribution_for_the_day(
    workspace_sessions: sessionmaker[Session], study: StudyService
) -> None:
    ids = add_cards(workspace_sessions, 3)
    for item_id, rating in zip(ids, (Rating.GOOD, Rating.GOOD, Rating.AGAIN), strict=True):
        study.rate(item_id, rating, now=NOON)
    assert study.rating_distribution("2026-11-14") == {3: 2, 1: 1}
    assert study.rating_distribution() == {3: 2, 1: 1}
