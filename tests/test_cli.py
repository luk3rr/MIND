# Filename: test_cli.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import pytest
import uvicorn

from mind import __main__ as cli


def test_defaults_come_from_the_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MIND_DATA_DIR", str(tmp_path))
    monkeypatch.chdir(tmp_path)
    args = cli.build_parser().parse_args([])
    settings = cli.resolve_settings(args)
    assert settings.host == "127.0.0.1"
    assert settings.data_dir == tmp_path


def test_flags_override_the_environment(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MIND_PORT", "9000")
    monkeypatch.chdir(tmp_path)
    args = cli.build_parser().parse_args(
        ["--host", "127.0.0.2", "--port", "9100", "--data-dir", str(tmp_path / "d")]
    )
    settings = cli.resolve_settings(args)
    assert (settings.host, settings.port) == ("127.0.0.2", 9100)
    assert settings.data_dir == tmp_path / "d"


def test_main_starts_uvicorn_on_the_resolved_address(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: dict[str, object] = {}

    def fake_run(app: object, **kwargs: object) -> None:
        calls["app"] = app
        calls.update(kwargs)

    monkeypatch.setattr(uvicorn, "run", fake_run)
    monkeypatch.chdir(tmp_path)
    cli.main(["--port", "8123", "--data-dir", str(tmp_path / "data")])
    assert calls["host"] == "127.0.0.1"
    assert calls["port"] == 8123
    assert calls["app"] is not None
