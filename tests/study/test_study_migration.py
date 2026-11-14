# Filename: test_study_migration.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from mind.clock import utcnow
from mind.db import migrate
from mind.db.workspace_models import CardState, GenerationRun, Item, ReviewLog


def add_item(session: Session) -> int:
    run = GenerationRun(kind="card", subtype="qa", model="m", requested=1)
    session.add(run)
    session.flush()
    item = Item(run_id=run.id, kind="card", subtype="qa", payload_json="{}", status="approved")
    session.add(item)
    session.flush()
    return item.id


def test_upgrade_from_the_generation_revision_adds_the_study_tables(tmp_path: Path) -> None:
    path = tmp_path / "workspace.db"
    engine = migrate.upgrade("workspace", path, target="0004")
    assert "card_state" not in inspect(engine).get_table_names()
    engine = migrate.upgrade("workspace", path)
    assert {"card_state", "review_log"} <= set(inspect(engine).get_table_names())
    assert migrate.current_revision(engine) == migrate.head_revision("workspace")


def test_deleting_an_item_removes_its_state_and_history(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        item_id = add_item(session)
        session.add(CardState(item_id=item_id, fsrs_json="{}", due=utcnow()))
        session.add(ReviewLog(item_id=item_id, rating=3, day="2026-11-14"))
        session.commit()
        session.delete(session.get(Item, item_id))
        session.commit()
        assert session.query(CardState).count() == 0
        assert session.query(ReviewLog).count() == 0


def test_due_is_stored_as_timezone_aware_utc(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        item_id = add_item(session)
        moment = utcnow()
        session.add(CardState(item_id=item_id, fsrs_json="{}", due=moment))
        session.commit()
        state = session.get(CardState, item_id)
        assert state is not None
        assert state.due == moment
        assert state.due.utcoffset() is not None
