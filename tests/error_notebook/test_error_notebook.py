# Filename: test_error_notebook.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import inspect
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db import migrate
from mind.db.workspace_models import Attempt, GenerationRun, Item, ReviewLog, Topic
from mind.error_notebook.service import ErrorNotebook, error_card_text
from mind.errors import ItemNotFound, ValidationFailed
from mind.study.scheduler import Rating, Scheduler
from mind.study.service import StudyService

NOON = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)
MC = {
    "statement": "Qual organela faz a respiração celular?",
    "options": [
        {"key": "A", "text": "Núcleo", "why": "x"},
        {"key": "B", "text": "Mitocôndria", "why": "y"},
    ],
    "answer": "B",
    "explanation": "A mitocôndria respira.",
}
TF = {
    "statement": "O núcleo faz a respiração celular.",
    "options": [
        {"key": "C", "text": "Certo", "why": ""},
        {"key": "E", "text": "Errado", "why": ""},
    ],
    "answer": "E",
    "explanation": "Quem respira é a mitocôndria.",
}


def add_question(
    sessions: sessionmaker[Session],
    payload: Mapping[str, Any],
    *,
    subtype: str = "multiple_choice",
    status: str = "approved",
    topic: str | None = "Células",
) -> int:
    with sessions() as session:
        run = GenerationRun(kind="question", subtype="multiple_choice_4", model="m", requested=1)
        session.add(run)
        topic_row = None
        if topic:
            topic_row = session.query(Topic).filter_by(name=topic).first() or Topic(name=topic)
            session.add(topic_row)
        session.flush()
        item = Item(
            run_id=run.id,
            kind="question",
            subtype=subtype,
            payload_json=json.dumps(payload),
            status=status,
            topic_id=topic_row.id if topic_row else None,
            source_title="Aula",
            source_page=7,
            quote="a mitocôndria é a organela responsável",
        )
        session.add(item)
        session.commit()
        return item.id


def answer(sessions: sessionmaker[Session], item_id: int, key: str, correct: bool) -> None:
    with sessions() as session:
        session.add(Attempt(item_id=item_id, answer=key, correct=correct, day="2026-11-14"))
        session.commit()


@pytest.fixture
def notebook(workspace_sessions: sessionmaker[Session]) -> ErrorNotebook:
    return ErrorNotebook(workspace_sessions)


def test_migration_0007_adds_the_origin_link(tmp_path: Path) -> None:
    path = tmp_path / "workspace.db"
    engine = migrate.upgrade("workspace", path, target="0006")
    assert "origin_item_id" not in {c["name"] for c in inspect(engine).get_columns("item")}
    engine = migrate.upgrade("workspace", path)
    assert "origin_item_id" in {c["name"] for c in inspect(engine).get_columns("item")}


def test_multiple_choice_errors_become_a_qa_card_with_options_and_the_right_answer() -> None:
    subtype, front, back = error_card_text("multiple_choice", MC)
    assert subtype == "qa"
    assert front == "Qual organela faz a respiração celular?\n\nA) Núcleo\nB) Mitocôndria"
    assert back == "Resposta: B) Mitocôndria\n\nA mitocôndria respira."


@pytest.mark.parametrize(("answer_key", "verdict"), [("C", "Verdadeiro"), ("E", "Falso")])
def test_true_false_errors_start_the_back_with_the_verdict(answer_key: str, verdict: str) -> None:
    subtype, front, back = error_card_text("certo_errado", {**TF, "answer": answer_key})
    assert (subtype, front) == ("true_false", TF["statement"])
    assert back.startswith(f"{verdict}. ")


def test_only_missed_approved_questions_can_become_cards(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    unanswered = add_question(workspace_sessions, MC)
    right_only = add_question(workspace_sessions, MC)
    draft = add_question(workspace_sessions, MC, status="draft")
    answer(workspace_sessions, right_only, "B", True)
    for question in (unanswered, right_only):
        with pytest.raises(ValidationFailed):
            notebook.create_card(question)
    answer(workspace_sessions, draft, "A", False)
    with pytest.raises(ValidationFailed):
        notebook.create_card(draft)
    with pytest.raises(ItemNotFound):
        notebook.create_card(999)


def test_the_card_is_approved_keeps_the_source_and_the_topic(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    question = add_question(workspace_sessions, MC)
    answer(workspace_sessions, question, "A", False)

    created = notebook.create_card(question)

    assert created.created is True
    with workspace_sessions() as session:
        card = session.get(Item, created.item_id)
        original = session.get(Item, question)
        assert card is not None
        assert original is not None
        assert (card.kind, card.subtype, card.status, card.origin) == (
            "card",
            "qa",
            "approved",
            "error_note",
        )
        assert card.origin_item_id == question
        assert (card.source_title, card.source_page, card.quote) == (
            "Aula",
            7,
            "a mitocôndria é a organela responsável",
        )
        assert card.topic_id == original.topic_id
        assert card.approved_at is not None
    assert notebook.card_for(question) == created.item_id


def test_creating_twice_returns_the_same_card(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    question = add_question(workspace_sessions, MC)
    answer(workspace_sessions, question, "A", False)
    first = notebook.create_card(question)
    second = notebook.create_card(question)
    assert (second.item_id, second.created) == (first.item_id, False)
    assert len(notebook.entries()) == 1
    assert notebook.card_for(999) is None


def test_the_notebook_run_is_created_once_and_hidden_from_generations(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    for payload in (MC, {**MC, "statement": "Outra questão?"}):
        question = add_question(workspace_sessions, payload)
        answer(workspace_sessions, question, "A", False)
        notebook.create_card(question)
    with workspace_sessions() as session:
        runs = session.query(GenerationRun).filter_by(kind="notebook").all()
        assert len(runs) == 1
        assert (runs[0].subtype, runs[0].status) == ("error_note", "done")


def test_cards_rated_errei_are_listed_without_being_duplicated(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    study = StudyService(
        workspace_sessions, scheduler=Scheduler(enable_fuzzing=False), clock=lambda: NOON
    )
    with workspace_sessions() as session:
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=2)
        session.add(run)
        session.flush()
        ids = []
        for number in range(2):
            card = Item(
                run_id=run.id,
                kind="card",
                subtype="qa",
                payload_json=json.dumps({"front": f"Card {number}?", "back": "R"}),
                status="approved",
                approved_at=NOON,
                source_title="Aula",
            )
            session.add(card)
            session.flush()
            ids.append(card.id)
        session.commit()
    study.rate(ids[0], Rating.AGAIN, now=NOON)
    study.rate(ids[0], Rating.AGAIN, now=NOON + timedelta(minutes=1))
    study.rate(ids[1], Rating.GOOD, now=NOON)

    entries = notebook.entries()

    assert [(e.item_id, e.failures, e.from_question) for e in entries] == [(ids[0], 2, False)]
    assert entries[0].front == "Card 0?"
    assert notebook.counts().failed_cards == 1
    with workspace_sessions() as session:
        assert session.query(Item).count() == 2  # nothing was created


def test_entries_combine_both_sources_filter_by_topic_and_order_newest_first(
    workspace_sessions: sessionmaker[Session], notebook: ErrorNotebook
) -> None:
    question = add_question(workspace_sessions, MC, topic="Células")
    answer(workspace_sessions, question, "A", False)
    made = notebook.create_card(question)
    with workspace_sessions() as session:
        session.add(
            ReviewLog(
                item_id=made.item_id,
                rating=1,
                reviewed_at=utcnow() + timedelta(days=1),
                day="2026-11-15",
            )
        )
        made_item = session.get(Item, made.item_id)
        assert made_item is not None
        other = Item(
            run_id=made_item.run_id,
            kind="card",
            subtype="qa",
            payload_json=json.dumps({"front": "Sem tópico?", "back": "R"}),
            status="approved",
            origin="error_note",
        )
        session.add(other)
        session.commit()
        topic_id = session.query(Topic).filter_by(name="Células").one().id
    all_entries = notebook.entries()
    assert all_entries[0].front.startswith("Qual organela")
    assert len(all_entries) == 2
    assert all_entries[0].failures == 1
    assert [e.item_id for e in notebook.entries(topic_id)] == [made.item_id]
    counts = notebook.counts()
    assert (counts.total, counts.from_questions, counts.failed_cards) == (2, 2, 1)
