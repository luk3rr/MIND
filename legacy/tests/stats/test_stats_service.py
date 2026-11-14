# Filename: test_stats_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Attempt, GenerationRun, Item, ReviewLog, Topic
from mind.stats.service import MIN_EVENTS, StatsService, _streaks

BRT = timezone(timedelta(hours=-3))
NOON = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)
TODAY = "2026-11-14"


def day(offset: int) -> str:
    return (datetime(2026, 11, 14) + timedelta(days=offset)).strftime("%Y-%m-%d")


class World:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self.sessions = sessions
        with sessions() as session:
            self.run = GenerationRun(kind="card", subtype="qa", model="m", requested=1)
            session.add(self.run)
            session.flush()
            self.run_id = self.run.id
            session.commit()

    def topic(self, name: str) -> int:
        with self.sessions() as session:
            topic = Topic(name=name)
            session.add(topic)
            session.commit()
            return topic.id

    def item(self, kind: str, topic_id: int | None, status: str = "approved") -> int:
        with self.sessions() as session:
            item = Item(
                run_id=self.run_id,
                kind=kind,
                subtype="qa",
                payload_json=json.dumps({}),
                status=status,
                topic_id=topic_id,
            )
            session.add(item)
            session.commit()
            return item.id

    def reviews(
        self, item_id: int, ratings: list[int], on: str = TODAY, state: int | None = None
    ) -> None:
        previous = None if state is None else json.dumps({"state": state})
        with self.sessions() as session:
            for rating in ratings:
                session.add(
                    ReviewLog(
                        item_id=item_id,
                        rating=rating,
                        day=on,
                        previous_state_json=previous,
                        reviewed_at=NOON,
                    )
                )
            session.commit()

    def attempts(self, item_id: int, results: list[bool], on: str = TODAY) -> None:
        with self.sessions() as session:
            for ok in results:
                session.add(
                    Attempt(item_id=item_id, answer="A", correct=ok, day=on, answered_at=NOON)
                )
            session.commit()


@pytest.fixture
def world(workspace_sessions: sessionmaker[Session]) -> World:
    return World(workspace_sessions)


@pytest.fixture
def stats(workspace_sessions: sessionmaker[Session]) -> StatsService:
    return StatsService(workspace_sessions, clock=lambda: NOON, tz=BRT)


def test_topic_accuracy_combines_cards_and_questions(world: World, stats: StatsService) -> None:
    cells = world.topic("Células")
    card, question = world.item("card", cells), world.item("question", cells)
    world.reviews(card, [3, 3, 2, 1])
    world.attempts(question, [True, False])

    [stat] = stats.topic_stats()

    assert (stat.name, stat.card_reviews, stat.card_passes) == ("Células", 4, 3)
    assert (stat.question_attempts, stat.question_correct) == (2, 1)
    assert stat.accuracy == pytest.approx(4 / 6)
    assert (stat.card_accuracy, stat.question_accuracy) == (0.75, 0.5)
    assert stat.small_sample is False
    assert stat.events >= MIN_EVENTS


def test_small_samples_untouched_topics_and_items_without_a_topic(
    world: World, stats: StatsService
) -> None:
    few = world.topic("Poucos")
    world.reviews(world.item("card", few), [3])
    world.topic("Sem itens")  # no approved items: not reported
    idle = world.topic("Parado")
    world.item("card", idle)
    loose = world.item("card", None)
    world.reviews(loose, [1, 3])

    by_name = {s.name: s for s in stats.topic_stats()}

    assert by_name["Poucos"].small_sample is True
    assert (by_name["Parado"].events, by_name["Parado"].accuracy) == (0, None)
    assert "Sem itens" not in by_name
    assert by_name[None].card_reviews == 2
    assert [s.name for s in stats.topic_stats()][-1] is None  # the no-topic bucket comes last


def test_drafts_and_discarded_items_are_ignored(world: World, stats: StatsService) -> None:
    topic = world.topic("Rascunhos")
    for status in ("draft", "discarded"):
        item = world.item("card", topic, status)
        world.reviews(item, [3, 3])
    assert stats.topic_stats() == []


def test_the_weakest_topics_need_enough_events_and_are_ordered_by_accuracy(
    world: World, stats: StatsService
) -> None:
    for name, ratings in (
        ("Fraco", [1, 1, 3, 1, 1]),
        ("Médio", [3, 1, 3, 1, 3]),
        ("Forte", [3] * 5),
    ):
        world.reviews(world.item("card", world.topic(name)), ratings)
    world.reviews(world.item("card", world.topic("Pouco")), [1])

    assert [s.name for s in stats.weakest_topics()] == ["Fraco", "Médio", "Forte"]
    assert [s.name for s in stats.weakest_topics(limit=1)] == ["Fraco"]
    assert len(stats.weakest_topics(min_events=1)) == 4


def test_retention_counts_only_reviews_of_cards_already_in_review(
    world: World, stats: StatsService
) -> None:
    card = world.item("card", None)
    world.reviews(card, [3, 3, 1], on=TODAY, state=2)  # 2 of 3 retained
    world.reviews(card, [1], on=day(-1), state=2)
    world.reviews(card, [1, 1], on=TODAY, state=1)  # learning: not counted
    world.reviews(card, [1], on=TODAY, state=None)  # first time: not counted
    world.reviews(card, [3], on=day(-60), state=2)  # outside the window

    result = stats.retention(30, NOW)

    assert len(result.days) == 30
    assert (result.days[-1].day, result.days[-1].reviews, result.days[-1].passes) == (TODAY, 3, 2)
    assert result.days[-1].rate == pytest.approx(2 / 3)
    assert (result.days[-2].reviews, result.days[-2].rate) == (1, 0.0)
    assert result.days[0].rate is None
    assert result.reviews == 4
    assert result.rate == pytest.approx(2 / 4)


NOW = NOON


def test_activity_adds_reviews_and_attempts_per_day(world: World, stats: StatsService) -> None:
    world.reviews(world.item("card", None), [3, 3], on=TODAY)
    world.attempts(world.item("question", None), [True], on=TODAY)
    world.attempts(world.item("question", None), [False, False], on=day(-2))

    days = stats.activity(7, NOW)

    assert [d.day for d in days][-1] == TODAY
    assert [(d.reviews, d.attempts, d.total) for d in days if d.total] == [(0, 2, 2), (2, 1, 3)]


def test_the_summary_reports_today_the_goal_and_the_streaks(
    world: World, stats: StatsService
) -> None:
    card, question = world.item("card", None), world.item("question", None)
    for offset in (-3, -2, -1, 0):
        world.reviews(card, [3], on=day(offset))
    world.attempts(question, [True, True], on=TODAY)
    world.reviews(card, [3], on=day(-10))
    world.reviews(card, [3], on=day(-9))

    summary = stats.summary(NOW)

    assert (summary.reviewed_today, summary.answered_today, summary.activity_today) == (1, 2, 3)
    assert (summary.goal, summary.goal_met) == (40, False)
    assert (summary.current_streak, summary.longest_streak) == (4, 4)
    assert (summary.total_reviews, summary.total_attempts) == (6, 2)


def test_streaks_ignore_a_day_that_has_not_ended_but_break_on_a_missed_one() -> None:
    assert _streaks(set(), "2026-11-14") == (0, 0)
    assert _streaks({"2026-11-13", "2026-11-12"}, "2026-11-14") == (2, 2)  # today still open
    assert _streaks({"2026-11-11"}, "2026-11-14") == (0, 1)  # a whole day was missed
    assert _streaks({"2026-11-14", "2026-11-12", "2026-11-11", "2026-11-10"}, "2026-11-14") == (
        1,
        3,
    )
