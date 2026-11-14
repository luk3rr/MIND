# Filename: _env.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Alembic environment shared by the `app` and `workspace` databases."""

from __future__ import annotations

from typing import Any

from alembic import context


def run_online(config: Any) -> None:
    """Run the migrations using the connection passed through `config.attributes`."""
    connection = config.attributes["connection"]
    context.configure(connection=connection, target_metadata=None, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
