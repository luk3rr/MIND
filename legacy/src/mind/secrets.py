# Filename: secrets.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Storage of the provider API key: environment first, then a private `.env` file."""

from __future__ import annotations

import os
import re
import tempfile
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from mind.errors import ValidationFailed

ENV_NAME = "OPENROUTER_API_KEY"
KeySource = Literal["environment", "file"]


class SecretStore:
    """Reads and writes the API key. The key is never exposed to the UI or the API."""

    def __init__(self, data_dir: Path, env: Mapping[str, str] | None = None) -> None:
        self._env_file = data_dir / ".env"
        self._env = os.environ if env is None else env

    @property
    def env_file(self) -> Path:
        return self._env_file

    def _read_file_lines(self) -> list[str]:
        if not self._env_file.is_file():
            return []
        return self._env_file.read_text(encoding="utf-8").splitlines()

    def _file_key(self) -> str | None:
        for line in self._read_file_lines():
            name, _, value = line.partition("=")
            if name.strip() == ENV_NAME and value.strip():
                return value.strip().strip("\"'")
        return None

    def api_key(self) -> str | None:
        """Return the key for the provider client. Only the LLM layer may call this."""
        return self._env.get(ENV_NAME) or self._file_key()

    def is_configured(self) -> bool:
        return self.api_key() is not None

    def source(self) -> KeySource | None:
        if self._env.get(ENV_NAME):
            return "environment"
        return "file" if self._file_key() else None

    def save_api_key(self, key: str) -> None:
        """Write the key to the `.env` file (mode 600), keeping every other line."""
        cleaned = key.strip()
        if not cleaned or re.search(r"\s", cleaned):
            raise ValidationFailed("A chave de API não pode ser vazia nem conter espaços.")
        kept = [
            line for line in self._read_file_lines() if line.partition("=")[0].strip() != ENV_NAME
        ]
        self._write_private([*kept, f"{ENV_NAME}={cleaned}"])

    def clear_api_key(self) -> None:
        kept = [
            line for line in self._read_file_lines() if line.partition("=")[0].strip() != ENV_NAME
        ]
        if self._env_file.is_file():
            self._write_private(kept)

    def _write_private(self, lines: list[str]) -> None:
        self._env_file.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temp_name = tempfile.mkstemp(dir=self._env_file.parent, prefix=".env.")
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write("\n".join(lines) + ("\n" if lines else ""))
            os.replace(temp_name, self._env_file)
        except BaseException:
            Path(temp_name).unlink(missing_ok=True)
            raise
