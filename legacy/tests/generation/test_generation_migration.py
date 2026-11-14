# Filename: test_generation_migration.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from mind.db import migrate
from mind.db.workspace_models import Chunk, GenerationRun, Item, Material, Topic


def seed(session: Session) -> tuple[Material, GenerationRun, Item]:
    material = Material(title="Aula", kind="pdf", filename="a.pdf", stored_path="a.pdf")
    material.chunks = [Chunk(ordinal=0, page=1, text="texto de origem")]
    topic = Topic(name="Celulas")
    run = GenerationRun(kind="card", subtype="qa", model="m", requested=5, status="done")
    session.add_all([material, topic, run])
    session.flush()
    run.material_id = material.id
    item = Item(
        run_id=run.id,
        kind="card",
        subtype="qa",
        payload_json="{}",
        topic_id=topic.id,
        chunk_id=material.chunks[0].id,
        source_title="Aula",
        source_page=1,
        quote="texto de origem",
    )
    session.add(item)
    session.commit()
    return material, run, item


def test_upgrade_from_the_material_revision_adds_generation_tables(tmp_path: Path) -> None:
    path = tmp_path / "workspace.db"
    engine = migrate.upgrade("workspace", path, target="0003")
    assert "item" not in inspect(engine).get_table_names()
    engine = migrate.upgrade("workspace", path)
    assert {"topic", "generation_run", "item"} <= set(inspect(engine).get_table_names())
    assert migrate.current_revision(engine) == migrate.head_revision("workspace")


def test_deleting_the_material_keeps_runs_and_items_but_clears_the_links(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        material, run, item = seed(session)
        session.delete(material)
        session.commit()
        session.refresh(run)
        session.refresh(item)
        assert run.material_id is None
        assert item.chunk_id is None
        assert item.quote == "texto de origem"
        assert item.source_title == "Aula"


def test_deleting_a_run_deletes_its_items(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        _, run, _ = seed(session)
        session.delete(run)
        session.commit()
        assert session.query(Item).count() == 0
