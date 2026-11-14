# Filename: topics.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Topic helpers shared by the card and question generators."""

from __future__ import annotations

from sqlalchemy.orm import Session

from mind.db.workspace_models import Topic


def upsert_topic(session: Session, known: dict[str, Topic], name: str | None) -> Topic | None:
    """Return the topic named `name` (case-insensitive), creating it when needed."""
    if name is None:
        return None
    topic = known.get(name.casefold())
    if topic is None:
        topic = Topic(name=name)
        session.add(topic)
        session.flush()
        known[name.casefold()] = topic
    return topic
