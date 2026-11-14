# Filename: consent.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Records that the user accepted sending material excerpts to a provider (FR-20)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.app_models import Consent


class ConsentService:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    def is_given(self, provider: str) -> bool:
        with self._sessions() as session:
            return session.get(Consent, provider) is not None

    def given_at(self, provider: str) -> datetime | None:
        with self._sessions() as session:
            row = session.get(Consent, provider)
            return row.accepted_at if row else None

    def give(self, provider: str) -> None:
        with self._sessions() as session:
            if session.get(Consent, provider) is None:
                session.add(Consent(provider=provider, accepted_at=utcnow()))
                session.commit()

    def revoke(self, provider: str) -> None:
        with self._sessions() as session:
            row = session.get(Consent, provider)
            if row is not None:
                session.delete(row)
                session.commit()
