# Filename: test_config.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import platformdirs
import pytest
from pydantic import ValidationError

from mind.config import load_settings, parse_env_file


def test_defaults_bind_only_to_localhost() -> None:
    settings = load_settings(env={})
    assert settings.host == "127.0.0.1"
    assert settings.port == 8000
    assert settings.max_concurrent_jobs == 2
    assert settings.data_dir == Path(platformdirs.user_data_dir("mind"))


def test_environment_overrides_defaults(tmp_path: Path) -> None:
    settings = load_settings(
        env={
            "MIND_DATA_DIR": str(tmp_path),
            "MIND_HOST": "0.0.0.0",  # noqa: S104
            "MIND_PORT": "9001",
            "MIND_LOG_LEVEL": "debug",
            "MIND_MAX_JOBS": "4",
        }
    )
    assert settings.data_dir == tmp_path
    assert settings.host == "0.0.0.0"  # noqa: S104
    assert settings.port == 9001
    assert settings.log_level == "DEBUG"
    assert settings.max_concurrent_jobs == 4
    assert settings.app_db_path == tmp_path / "app.db"
    assert settings.workspaces_dir == tmp_path / "workspaces"


def test_env_file_is_read_and_environment_wins(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("# comment\nMIND_PORT=7000\nMIND_HOST='127.0.0.2'\n\ngarbage\n")
    assert parse_env_file(env_file) == {"MIND_PORT": "7000", "MIND_HOST": "127.0.0.2"}

    settings = load_settings(env={"MIND_PORT": "7100"}, env_file=env_file)
    assert settings.port == 7100
    assert settings.host == "127.0.0.2"


def test_missing_env_file_is_ignored(tmp_path: Path) -> None:
    assert parse_env_file(tmp_path / "missing.env") == {}


@pytest.mark.parametrize("port", ["0", "70000"])
def test_invalid_port_is_rejected(port: str) -> None:
    with pytest.raises(ValidationError):
        load_settings(env={"MIND_PORT": port})
