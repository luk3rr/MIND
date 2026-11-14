# Filename: test_walking_skeleton.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from fastapi.testclient import TestClient

from mind.config import Settings
from mind.web.app import create_app


def test_walking_skeleton_end_to_end(tmp_path: Path) -> None:
    """The app starts, creates a workspace and opens its Today page (T-1.12)."""
    settings = Settings(data_dir=tmp_path)
    assert settings.host == "127.0.0.1"

    with TestClient(create_app(settings), follow_redirects=True) as client:
        welcome = client.get("/")
        assert welcome.status_code == 200
        assert "Boas-vindas" in welcome.text

        created = client.post("/workspaces", data={"name": "Biology"})
        assert created.status_code == 200
        assert "Hoje" in created.text
        assert "Biology" in created.text

    workspace_dirs = list((tmp_path / "workspaces").iterdir())
    assert len(workspace_dirs) == 1
    assert (workspace_dirs[0] / "workspace.db").is_file()
    assert (tmp_path / "app.db").is_file()
