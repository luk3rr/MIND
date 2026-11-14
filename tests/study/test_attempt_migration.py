# Filename: test_attempt_migration.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from mind.clock import utcnow
from mind.db import migrate
from mind.db.workspace_models import Attempt, GenerationRun, Item


def test_upgrade_from_the_study_revision_adds_attempt_and_the_counter(tmp_path: Path) -> None:
    path = tmp_path / "workspace.db"
    engine = migrate.upgrade("workspace", path, target="0005")
    run_columns = {c["name"] for c in inspect(engine).get_columns("generation_run")}
    assert "discarded_unsupported" not in run_columns

    with Session(engine) as session:  # a run created before the upgrade keeps working
        session.execute(
            sa.text(
                "INSERT INTO generation_run (kind, subtype, model, requested, generated, "
                "discarded_no_source, discarded_invalid, discarded_duplicate, approved, "
                "approved_unedited, discarded_review, cost_usd, status, discard_log, created_at) "
                "VALUES ('card', 'qa', 'm', 1, 0, 0, 0, 0, 0, 0, 0, 0.0, 'done', '[]', :now)"
            ),
            {"now": utcnow().isoformat()},
        )
        session.commit()

    engine = migrate.upgrade("workspace", path)
    assert "attempt" in inspect(engine).get_table_names()
    with Session(engine) as session:
        old = session.query(GenerationRun).one()
        assert old.discarded_unsupported == 0
    assert migrate.current_revision(engine) == migrate.head_revision("workspace")


def test_deleting_an_item_removes_its_attempts(tmp_path: Path) -> None:
    engine = migrate.upgrade("workspace", tmp_path / "workspace.db")
    with Session(engine) as session:
        run = GenerationRun(kind="question", subtype="certo_errado", model="m", requested=1)
        session.add(run)
        session.flush()
        item = Item(run_id=run.id, kind="question", subtype="certo_errado", payload_json="{}")
        session.add(item)
        session.flush()
        session.add(Attempt(item_id=item.id, answer="C", correct=True, day="2026-11-14"))
        session.commit()
        session.delete(item)
        session.commit()
        assert session.query(Attempt).count() == 0
