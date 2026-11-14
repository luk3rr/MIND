# Filename: test_secrets.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import stat
from pathlib import Path

import pytest

from mind.errors import ValidationFailed
from mind.secrets import ENV_NAME, SecretStore


def test_unconfigured_store_reports_nothing(tmp_path: Path) -> None:
    store = SecretStore(tmp_path, env={})
    assert store.api_key() is None
    assert store.is_configured() is False
    assert store.source() is None


def test_saved_key_is_written_with_private_permissions(tmp_path: Path) -> None:
    store = SecretStore(tmp_path, env={})
    store.save_api_key("sk-or-v1-abc123")
    assert store.api_key() == "sk-or-v1-abc123"
    assert store.source() == "file"
    mode = stat.S_IMODE(store.env_file.stat().st_mode)
    assert mode == 0o600


def test_save_keeps_other_lines_and_replaces_the_old_key(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(f"MIND_PORT=9000\n{ENV_NAME}=old\n# note\n")
    store = SecretStore(tmp_path, env={})
    store.save_api_key("new-key")
    lines = (tmp_path / ".env").read_text().splitlines()
    assert lines == ["MIND_PORT=9000", "# note", f"{ENV_NAME}=new-key"]


def test_environment_takes_precedence_over_the_file(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(f"{ENV_NAME}=from-file\n")
    store = SecretStore(tmp_path, env={ENV_NAME: "from-env"})
    assert store.api_key() == "from-env"
    assert store.source() == "environment"


def test_quoted_values_in_the_file_are_unquoted(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(f'{ENV_NAME}="quoted"\n')
    assert SecretStore(tmp_path, env={}).api_key() == "quoted"


@pytest.mark.parametrize("key", ["", "   ", "has space", "line\nbreak"])
def test_invalid_keys_are_rejected(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValidationFailed):
        SecretStore(tmp_path, env={}).save_api_key(key)
    assert not (tmp_path / ".env").exists()


def test_clear_removes_only_the_key_line(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(f"MIND_PORT=9000\n{ENV_NAME}=old\n")
    store = SecretStore(tmp_path, env={})
    store.clear_api_key()
    assert store.api_key() is None
    assert (tmp_path / ".env").read_text() == "MIND_PORT=9000\n"


def test_clear_without_a_file_is_a_no_op(tmp_path: Path) -> None:
    SecretStore(tmp_path, env={}).clear_api_key()
    assert not (tmp_path / ".env").exists()
