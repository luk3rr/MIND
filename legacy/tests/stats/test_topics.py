# Filename: test_topics.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import GenerationRun, Item, Topic
from mind.errors import TopicNotFound, ValidationFailed
from mind.stats.topics import TopicService


def add_topic(sessions: sessionmaker[Session], name: str) -> int:
    with sessions() as session:
        topic = Topic(name=name)
        session.add(topic)
        session.commit()
        return topic.id


def add_items(
    sessions: sessionmaker[Session],
    topic_id: int | None,
    *,
    cards: int = 0,
    questions: int = 0,
    status: str = "approved",
) -> list[int]:
    with sessions() as session:
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=1)
        session.add(run)
        session.flush()
        ids = []
        for kind, count in (("card", cards), ("question", questions)):
            for _ in range(count):
                item = Item(
                    run_id=run.id,
                    kind=kind,
                    subtype="qa",
                    payload_json=json.dumps({}),
                    status=status,
                    topic_id=topic_id,
                )
                session.add(item)
                session.flush()
                ids.append(item.id)
        session.commit()
        return ids


@pytest.fixture
def topics(workspace_sessions: sessionmaker[Session]) -> TopicService:
    return TopicService(workspace_sessions)


def test_topics_are_listed_alphabetically_with_their_approved_counts(
    workspace_sessions: sessionmaker[Session], topics: TopicService
) -> None:
    energy, cells = (
        add_topic(workspace_sessions, "energia"),
        add_topic(workspace_sessions, "Células"),
    )
    add_items(workspace_sessions, cells, cards=3, questions=2)
    add_items(workspace_sessions, cells, cards=4, status="draft")
    add_items(workspace_sessions, energy, cards=1)
    assert [(t.name, t.cards, t.questions) for t in topics.list_topics()] == [
        ("Células", 3, 2),
        ("energia", 1, 0),
    ]


def test_rename_cleans_the_name_and_keeps_names_unique_ignoring_case(
    workspace_sessions: sessionmaker[Session], topics: TopicService
) -> None:
    first, second = (
        add_topic(workspace_sessions, "Células"),
        add_topic(workspace_sessions, "Energia"),
    )
    assert topics.rename(first, "  Biologia   celular ").name == "Biologia celular"
    with pytest.raises(ValidationFailed) as clash:
        topics.rename(second, "biologia CELULAR")
    assert clash.value.errors[0].field == "name"
    assert topics.rename(second, "ENERGIA").name == "ENERGIA"  # a case change on itself is fine
    for bad in ("", "   "):
        with pytest.raises(ValidationFailed):
            topics.rename(first, bad)
    with pytest.raises(TopicNotFound):
        topics.rename(999, "X")


def test_merge_moves_every_item_and_removes_the_source(
    workspace_sessions: sessionmaker[Session], topics: TopicService
) -> None:
    source, target = (
        add_topic(workspace_sessions, "Celula"),
        add_topic(workspace_sessions, "Células"),
    )
    moved = add_items(workspace_sessions, source, cards=2, questions=1)
    add_items(workspace_sessions, target, cards=1)

    merged = topics.merge(source, target)

    assert (merged.name, merged.cards, merged.questions) == ("Células", 3, 1)
    assert [t.name for t in topics.list_topics()] == ["Células"]
    with workspace_sessions() as session:
        assert {session.get(Item, i).topic_id for i in moved} == {target}  # type: ignore[union-attr]


def test_merge_rejects_the_same_or_unknown_topics(
    workspace_sessions: sessionmaker[Session], topics: TopicService
) -> None:
    only = add_topic(workspace_sessions, "Único")
    with pytest.raises(ValidationFailed):
        topics.merge(only, only)
    with pytest.raises(TopicNotFound):
        topics.merge(only, 999)
    with pytest.raises(TopicNotFound):
        topics.merge(999, only)


def test_delete_leaves_the_items_without_a_topic(
    workspace_sessions: sessionmaker[Session], topics: TopicService
) -> None:
    topic = add_topic(workspace_sessions, "Apagar")
    [item] = add_items(workspace_sessions, topic, cards=1)
    topics.delete(topic)
    assert topics.list_topics() == []
    with workspace_sessions() as session:
        assert session.get(Item, item).topic_id is None  # type: ignore[union-attr]
    with pytest.raises(TopicNotFound):
        topics.delete(topic)
