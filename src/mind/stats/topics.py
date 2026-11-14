# Filename: topics.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Topic management: list, rename, merge and delete."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Item, Topic
from mind.errors import FieldError, TopicNotFound, ValidationFailed
from mind.generation.cards import clean_topic


@dataclass(frozen=True)
class TopicInfo:
    id: int
    name: str
    cards: int  # approved cards
    questions: int  # approved questions


class TopicService:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    def list_topics(self) -> list[TopicInfo]:
        with self._sessions() as session:
            counts: dict[tuple[int, str], int] = {
                (int(topic_id or 0), str(kind)): int(total)
                for topic_id, kind, total in session.execute(
                    select(Item.topic_id, Item.kind, func.count(Item.id))
                    .where(Item.status == "approved", Item.topic_id.is_not(None))
                    .group_by(Item.topic_id, Item.kind)
                )
            }
            topics = session.scalars(select(Topic).order_by(func.lower(Topic.name))).all()
            return [
                TopicInfo(
                    t.id, t.name, counts.get((t.id, "card"), 0), counts.get((t.id, "question"), 0)
                )
                for t in topics
            ]

    @staticmethod
    def _get(session: Session, topic_id: int) -> Topic:
        topic = session.get(Topic, topic_id)
        if topic is None:
            raise TopicNotFound(f"Não existe tópico com id {topic_id}.")
        return topic

    def get(self, topic_id: int) -> TopicInfo:
        found = next((t for t in self.list_topics() if t.id == topic_id), None)
        if found is None:
            raise TopicNotFound(f"Não existe tópico com id {topic_id}.")
        return found

    def rename(self, topic_id: int, raw_name: str) -> TopicInfo:
        name = clean_topic(raw_name)
        if name is None:
            raise ValidationFailed(
                "O nome do tópico não pode ser vazio.",
                errors=[FieldError("name", "Informe um nome.")],
            )
        with self._sessions() as session:
            topic = self._get(session, topic_id)
            clash = session.scalar(
                select(Topic.id).where(func.lower(Topic.name) == name.lower(), Topic.id != topic_id)
            )
            if clash is not None:
                raise ValidationFailed(
                    "Já existe um tópico com esse nome. Use a mesclagem para juntá-los.",
                    errors=[FieldError("name", "Nome já em uso.")],
                )
            topic.name = name
            session.commit()
        return next(t for t in self.list_topics() if t.id == topic_id)

    def merge(self, source_id: int, target_id: int) -> TopicInfo:
        """Move every item of `source_id` to `target_id` and remove the source topic."""
        if source_id == target_id:
            raise ValidationFailed("Escolha dois tópicos diferentes para mesclar.")
        with self._sessions() as session:
            source = self._get(session, source_id)
            self._get(session, target_id)
            session.execute(
                update(Item).where(Item.topic_id == source_id).values(topic_id=target_id)
            )
            session.delete(source)
            session.commit()
        return next(t for t in self.list_topics() if t.id == target_id)

    def delete(self, topic_id: int) -> None:
        """Delete a topic; its items stay, without a topic."""
        with self._sessions() as session:
            session.delete(self._get(session, topic_id))
            session.commit()
