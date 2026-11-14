# Filename: test_practice_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Attempt, GenerationRun, Item, Topic
from mind.errors import ItemNotFound, ValidationFailed
from mind.practice.service import PracticeService
from mind.study.service import StudyFilter

BRT = timezone(timedelta(hours=-3))
NOON = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)


def add_questions(
    sessions: sessionmaker[Session],
    count: int,
    *,
    status: str = "approved",
    topic: str | None = None,
    subtype: str = "multiple_choice",
) -> list[int]:
    with sessions() as session:
        run = GenerationRun(
            kind="question", subtype="multiple_choice_4", model="m", requested=count
        )
        session.add(run)
        topic_row = Topic(name=topic) if topic else None
        if topic_row:
            session.add(topic_row)
        session.flush()
        ids = []
        for number in range(count):
            options = [
                {"key": k, "text": f"Alternativa {k}", "why": f"Porque {k}."} for k in "ABCD"
            ]
            item = Item(
                run_id=run.id,
                kind="question",
                subtype=subtype,
                payload_json=json.dumps(
                    {
                        "statement": f"Questão {number}?",
                        "options": options,
                        "answer": "B",
                        "explanation": "A B é a correta.",
                    }
                ),
                status=status,
                topic_id=topic_row.id if topic_row else None,
                approved_at=NOON + timedelta(seconds=number) if status == "approved" else None,
            )
            session.add(item)
            session.flush()
            ids.append(item.id)
        session.commit()
        return ids


@pytest.fixture
def practice(workspace_sessions: sessionmaker[Session]) -> PracticeService:
    return PracticeService(workspace_sessions, clock=lambda: NOON, tz=BRT)


def fronts(practice: PracticeService, **kwargs: object) -> list[str]:
    return [q.item.front for q in practice.queue(50, **kwargs)]  # type: ignore[arg-type]


def test_only_approved_questions_are_practised_never_answered_ones_first(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    add_questions(workspace_sessions, 2, status="draft")
    ids = add_questions(workspace_sessions, 3)
    queue = practice.queue()
    assert [q.item.id for q in queue] == ids
    assert all(q.last_correct is None and q.attempts == 0 for q in queue)
    assert practice.counts().unseen == 3


def test_a_correct_answer_is_recorded_and_the_question_leaves_the_queue(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    [only] = add_questions(workspace_sessions, 1)
    result = practice.answer(only, "B", seconds=12.5, now=NOON)

    assert (result.correct, result.correct_key, result.answer) == (True, "B", "B")
    assert result.explanation == "A B é a correta."
    assert [o["why"] for o in result.options][:2] == ["Porque A.", "Porque B."]
    with workspace_sessions() as session:
        attempt = session.get(Attempt, result.attempt_id)
        assert attempt is not None
        assert (attempt.correct, attempt.seconds, attempt.day) == (True, 12.5, "2026-11-14")
    assert practice.queue() == []
    assert [q.item.id for q in practice.queue(redo=True)] == [only]
    assert practice.question(only).last_correct is True


def test_wrong_answers_return_after_the_unseen_ones_oldest_first(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    a, b, c = add_questions(workspace_sessions, 3)
    practice.answer(b, "A", now=NOON)  # wrong
    practice.answer(a, "A", now=NOON + timedelta(minutes=1))  # wrong, later
    assert [q.item.id for q in practice.queue()] == [c, b, a]
    queue = practice.queue()
    assert [(q.attempts, q.last_correct) for q in queue] == [(0, None), (1, False), (1, False)]
    counts = practice.counts(now=NOON)
    assert (counts.unseen, counts.retry, counts.to_practice) == (1, 2, 3)


def test_the_last_attempt_decides_the_state_and_repeated_attempts_are_counted(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    [only] = add_questions(workspace_sessions, 1)
    practice.answer(only, "A", now=NOON)
    practice.answer(only, "B", now=NOON + timedelta(minutes=1))
    assert practice.queue() == []
    question = practice.question(only)
    assert (question.attempts, question.last_correct) == (2, True)
    practice.answer(only, "C", now=NOON + timedelta(minutes=2))
    assert practice.question(only).last_correct is False
    assert [q.item.id for q in practice.queue()] == [only]


def test_exclude_skips_the_question_just_answered(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    [only] = add_questions(workspace_sessions, 1)
    practice.answer(only, "A", now=NOON)
    assert practice.next_question() is not None
    assert practice.next_question(exclude=[only]) is None


def test_the_selection_narrows_the_practice_and_forces_questions(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    add_questions(workspace_sessions, 2, topic="Células")
    other = add_questions(workspace_sessions, 1, topic="Energia", subtype="certo_errado")
    with workspace_sessions() as session:
        energy = session.query(Topic).filter_by(name="Energia").one().id
    assert [q.item.id for q in practice.queue(selection=StudyFilter(topic_id=energy))] == other
    assert [
        q.item.id for q in practice.queue(selection=StudyFilter(subtype="certo_errado"))
    ] == other
    assert len(practice.queue(selection=StudyFilter(kind="card"))) == 3  # kind is always question


def test_invalid_answers_and_targets_are_rejected(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    [question] = add_questions(workspace_sessions, 1)
    [draft] = add_questions(workspace_sessions, 1, status="draft")
    with pytest.raises(ValidationFailed) as error:
        practice.answer(question, "Z")
    assert error.value.errors[0].field == "answer"
    with pytest.raises(ValidationFailed):
        practice.answer(draft, "A")
    with pytest.raises(ItemNotFound):
        practice.answer(999, "A")
    with pytest.raises(ItemNotFound):
        practice.question(999)


def test_todays_counts_follow_the_study_day(
    workspace_sessions: sessionmaker[Session], practice: PracticeService
) -> None:
    a, b = add_questions(workspace_sessions, 2)
    practice.answer(a, "B", now=NOON)
    practice.answer(b, "A", now=NOON)
    counts = practice.counts(now=NOON)
    assert (counts.answered_today, counts.correct_today) == (2, 1)
    tomorrow = practice.counts(now=NOON + timedelta(days=1))
    assert (tomorrow.answered_today, tomorrow.correct_today) == (0, 0)
