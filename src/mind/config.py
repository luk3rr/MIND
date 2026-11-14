# Filename: config.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Application settings, read from the environment and an optional `.env` file."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

import platformdirs
from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Immutable settings for a single MIND run."""

    model_config = {"frozen": True}

    data_dir: Path
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    max_concurrent_jobs: int = Field(default=2, ge=1, le=16)

    @property
    def app_db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def workspaces_dir(self) -> Path:
        return self.data_dir / "workspaces"


def parse_env_file(path: Path) -> dict[str, str]:
    """Read a simple `.env` file (`KEY=value`, comments start with `#`)."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("\"'")
    return values


def load_settings(
    env: Mapping[str, str] | None = None,
    env_file: Path | None = None,
) -> Settings:
    """Build the settings. The environment takes precedence over the `.env` file."""
    merged: dict[str, str] = {}
    if env_file is not None:
        merged.update(parse_env_file(env_file))
    merged.update(os.environ if env is None else env)

    data_dir_value = merged.get("MIND_DATA_DIR")
    data_dir = (
        Path(data_dir_value).expanduser()
        if data_dir_value
        else Path(platformdirs.user_data_dir("mind"))
    )
    return Settings(
        data_dir=data_dir,
        host=merged.get("MIND_HOST", "127.0.0.1"),
        port=int(merged.get("MIND_PORT", "8000")),
        log_level=merged.get("MIND_LOG_LEVEL", "INFO").upper(),
        max_concurrent_jobs=int(merged.get("MIND_MAX_JOBS", "2")),
    )
