# Filename: migrate.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Programmatic application of Alembic migrations."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine

from mind.db.base import make_engine

Kind = Literal["app", "workspace"]

_MIGRATIONS = Path(__file__).parent / "migrations"


def _config(kind: Kind) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(_MIGRATIONS / kind))
    return cfg


def head_revision(kind: Kind) -> str:
    head = ScriptDirectory.from_config(_config(kind)).get_current_head()
    assert head is not None
    return head


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def upgrade(kind: Kind, db_path: Path, target: str = "head") -> Engine:
    """Create the database if needed and migrate the schema up to `target`. Return the engine."""
    engine = make_engine(db_path)
    cfg = _config(kind)
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, target)
    return engine
