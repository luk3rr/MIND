# Filename: test_workspace_registry.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from collections.abc import Iterator
from datetime import UTC, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from mind.config import Settings
from mind.db import migrate
from mind.errors import ValidationFailed, WorkspaceNotFound
from mind.workspaces.registry import WorkspaceRegistry


@pytest.fixture
def registry(tmp_path: Path) -> Iterator[WorkspaceRegistry]:
    reg = WorkspaceRegistry(Settings(data_dir=tmp_path))
    yield reg
    reg.close()


def test_create_builds_folder_and_migrated_database(registry: WorkspaceRegistry) -> None:
    info = registry.create("  Biologia   Celular ")
    assert info.name == "Biologia Celular"
    opened = registry.open(info.id)
    assert opened.files_dir.is_dir()
    assert migrate.current_revision(opened.engine) == migrate.head_revision("workspace")


def test_timestamps_are_timezone_aware_utc(registry: WorkspaceRegistry) -> None:
    info = registry.create("Clock")
    assert info.created_at.tzinfo is UTC
    assert registry.get(info.id).created_at.utcoffset() == timedelta(0)


def test_names_are_unique_ignoring_case(registry: WorkspaceRegistry) -> None:
    registry.create("Cálculo")
    with pytest.raises(ValidationFailed) as error:
        registry.create("cálculo")
    assert error.value.errors[0].field == "name"


@pytest.mark.parametrize("name", ["", "   ", "x" * 81])
def test_invalid_names_are_rejected(registry: WorkspaceRegistry, name: str) -> None:
    with pytest.raises(ValidationFailed):
        registry.create(name)


def test_workspaces_are_isolated(registry: WorkspaceRegistry) -> None:
    a = registry.open(registry.create("A").id)
    b = registry.open(registry.create("B").id)
    with a.engine.begin() as conn:
        conn.execute(text("INSERT INTO meta (key, value) VALUES ('x', '1')"))
    with b.engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM meta")).scalar() == 0
    assert a.root != b.root


def test_delete_removes_only_that_workspace(registry: WorkspaceRegistry) -> None:
    keep = registry.create("Manter")
    gone = registry.create("Apagar")
    gone_root = registry.open(gone.id).root
    registry.delete(gone.id)
    assert not gone_root.exists()
    assert registry.open(keep.id).root.exists()
    assert [w.name for w in registry.list()] == ["Manter"]
    with pytest.raises(WorkspaceNotFound):
        registry.get(gone.id)


def test_rename_checks_uniqueness(registry: WorkspaceRegistry) -> None:
    a = registry.create("A")
    registry.create("B")
    assert registry.rename(a.id, "Alfa").name == "Alfa"
    with pytest.raises(ValidationFailed):
        registry.rename(a.id, "b")
    with pytest.raises(WorkspaceNotFound):
        registry.rename(999, "Z")


def test_unknown_workspace_cannot_be_opened(registry: WorkspaceRegistry) -> None:
    with pytest.raises(WorkspaceNotFound):
        registry.open(42)
    with pytest.raises(WorkspaceNotFound):
        registry.delete(42)


def test_orphan_folders_are_removed_on_start(tmp_path: Path) -> None:
    first = WorkspaceRegistry(Settings(data_dir=tmp_path))
    first.close()
    orphan = tmp_path / "workspaces" / "orfa"
    orphan.mkdir()
    second = WorkspaceRegistry(Settings(data_dir=tmp_path))
    try:
        assert not orphan.exists()
    finally:
        second.close()


def test_folder_path_cannot_escape_workspaces_dir(registry: WorkspaceRegistry) -> None:
    with pytest.raises(ValidationFailed):
        registry._folder_path("../fora")
