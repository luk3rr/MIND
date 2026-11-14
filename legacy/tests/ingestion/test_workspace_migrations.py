# Filename: test_workspace_migrations.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from mind.db import migrate
from mind.db.workspace_models import Chunk, Material


def fts_matches(session: Session, query: str) -> list[int]:
    rows = session.execute(
        text("SELECT rowid FROM chunk_fts WHERE chunk_fts MATCH :q ORDER BY rowid"), {"q": query}
    )
    return [row[0] for row in rows]


def test_upgrade_from_the_job_revision_adds_material_chunk_and_fts(tmp_path: Path) -> None:
    path = tmp_path / "workspace.db"
    engine = migrate.upgrade("workspace", path, target="0002")
    assert "material" not in inspect(engine).get_table_names()

    engine = migrate.upgrade("workspace", path)
    tables = set(inspect(engine).get_table_names())
    assert {"material", "chunk", "chunk_fts"} <= tables
    assert migrate.current_revision(engine) == migrate.head_revision("workspace")


def test_fts_index_follows_inserts_updates_and_cascade_deletes(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        material = Material(title="Aula", kind="pdf", filename="a.pdf", stored_path="a.pdf")
        material.chunks = [
            Chunk(ordinal=0, page=1, text="A função de transferência é linear."),
            Chunk(ordinal=1, page=2, text="Outro assunto: biologia celular."),
        ]
        session.add(material)
        session.commit()
        first, second = (c.id for c in material.chunks)

        assert fts_matches(session, "funcao") == [first]
        assert fts_matches(session, "biologia") == [second]

        material.chunks[1].text = "Assunto novo: genética."
        session.commit()
        assert fts_matches(session, "biologia") == []
        assert fts_matches(session, "genetica") == [second]

        session.delete(material)
        session.commit()
        assert fts_matches(session, "funcao") == []
        assert fts_matches(session, "genetica") == []
