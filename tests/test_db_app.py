# Filename: test_db_app.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from mind.db import migrate
from mind.db.app_models import Workspace


def test_new_database_is_migrated_to_head(tmp_path: Path) -> None:
    engine = migrate.upgrade("app", tmp_path / "app.db")
    assert migrate.current_revision(engine) == migrate.head_revision("app")
    assert "workspace" in inspect(engine).get_table_names()


def test_upgrade_is_idempotent(tmp_path: Path) -> None:
    path = tmp_path / "app.db"
    migrate.upgrade("app", path)
    engine = migrate.upgrade("app", path)
    assert migrate.current_revision(engine) == migrate.head_revision("app")


def test_upgrade_creates_the_provider_tables(tmp_path: Path) -> None:
    engine = migrate.upgrade("app", tmp_path / "app.db")
    tables = set(inspect(engine).get_table_names())
    assert {"setting", "consent", "cost_ledger", "model_price"} <= tables


def test_upgrade_from_base_revision(tmp_path: Path) -> None:
    path = tmp_path / "app.db"
    engine = migrate.upgrade("app", path, target="0001")
    assert migrate.current_revision(engine) == "0001"
    engine = migrate.upgrade("app", path)
    assert migrate.current_revision(engine) == migrate.head_revision("app")


def test_pragmas_foreign_keys_and_wal(tmp_path: Path) -> None:
    engine = migrate.upgrade("app", tmp_path / "app.db")
    with engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert str(connection.execute(text("PRAGMA journal_mode")).scalar()).lower() == "wal"


def test_workspace_model_roundtrip(tmp_path: Path) -> None:
    engine = migrate.upgrade("app", tmp_path / "app.db")
    with Session(engine) as session:
        session.add(Workspace(name="Biologia", name_key="biologia", folder="abc123"))
        session.commit()
        saved = session.query(Workspace).one()
        assert saved.name == "Biologia"
        assert saved.created_at is not None
