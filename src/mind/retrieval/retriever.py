# Filename: retriever.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Chunk retrieval: the `Retriever` protocol and the BM25 (FTS5) implementation."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session, sessionmaker

TOKEN = re.compile(r"\w+", re.UNICODE)
MAX_TERMS = 32


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: int
    material_id: int
    material_title: str
    page: int | None
    section: str | None
    text: str
    score: float


class Retriever(Protocol):
    def search(
        self,
        query: str,
        *,
        material_ids: Sequence[int] | None = None,
        page_from: int | None = None,
        page_to: int | None = None,
        limit: int = 20,
    ) -> list[RetrievedChunk]: ...


def build_match_query(query: str) -> str | None:
    """Turn free text into a safe FTS5 query: quoted terms joined by OR."""
    terms = TOKEN.findall(query)[:MAX_TERMS]
    if not terms:
        return None
    return " OR ".join(f'"{term}"' for term in terms)


class Bm25Retriever:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._sessions = sessions

    def search(
        self,
        query: str,
        *,
        material_ids: Sequence[int] | None = None,
        page_from: int | None = None,
        page_to: int | None = None,
        limit: int = 20,
    ) -> list[RetrievedChunk]:
        match = build_match_query(query)
        if match is None or limit < 1:
            return []
        clauses = ["chunk_fts MATCH :match"]
        params: dict[str, object] = {"match": match, "limit": limit}
        if material_ids is not None:
            clauses.append("c.material_id IN :material_ids")
            params["material_ids"] = list(material_ids)
        if page_from is not None:
            clauses.append("c.page >= :page_from")
            params["page_from"] = page_from
        if page_to is not None:
            clauses.append("c.page <= :page_to")
            params["page_to"] = page_to
        # The WHERE clauses above are fixed literals; every value travels as a bound parameter.
        statement = text(
            "SELECT c.id, c.material_id, m.title, c.page, c.section, c.text, "  # noqa: S608
            "bm25(chunk_fts) AS rank "
            "FROM chunk_fts JOIN chunk c ON c.id = chunk_fts.rowid "
            "JOIN material m ON m.id = c.material_id "
            f"WHERE {' AND '.join(clauses)} ORDER BY rank LIMIT :limit"
        )
        if material_ids is not None:
            statement = statement.bindparams(bindparam("material_ids", expanding=True))
        with self._sessions() as session:
            rows = session.execute(statement, params).all()
        return [
            RetrievedChunk(
                chunk_id=row[0],
                material_id=row[1],
                material_title=row[2],
                page=row[3],
                section=row[4],
                text=row[5],
                score=-float(row[6]),
            )
            for row in rows
        ]
