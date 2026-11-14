# Filename: test_archive.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
import sqlite3
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import select

from mind.config import Settings
from mind.db.workspace_models import ChatMessage, Item, Material, Topic
from mind.errors import ArchiveIncompatible, ArchiveInvalid
from mind.workspaces.archive import export_workspace, import_workspace
from mind.workspaces.registry import WorkspaceRegistry


@pytest.fixture
def registry(tmp_path: Path) -> Iterator[WorkspaceRegistry]:
    found = WorkspaceRegistry(Settings(data_dir=tmp_path / "data"))
    yield found
    found.close()


def populated(registry: WorkspaceRegistry) -> int:
    info = registry.create("Biologia")
    workspace = registry.open(info.id)
    stored = workspace.files_dir / "abc" / "aula.md"
    stored.parent.mkdir(parents=True)
    stored.write_text("# Célula\n\nA mitocôndria produz energia.", encoding="utf-8")
    with workspace.sessions() as session:
        session.add(
            Material(title="Aula", kind="md", filename="aula.md", stored_path="files/abc/aula.md")
        )
        session.add(Topic(name="Célula"))
        session.add(ChatMessage(question="Q?", answer="R.", supported=False, citations_json="[]"))
        session.commit()
    return info.id


def rewrite(archive: Path, target: Path, **changes: object) -> Path:
    with zipfile.ZipFile(archive) as opened:
        manifest = json.loads(opened.read("manifest.json"))
        manifest.update(changes)
        with zipfile.ZipFile(target, "w") as out:
            for info in opened.infolist():
                if info.filename != "manifest.json":
                    out.writestr(info.filename, opened.read(info))
            out.writestr("manifest.json", json.dumps(manifest))
    return target


def test_a_round_trip_restores_data_and_files_under_a_new_name(
    registry: WorkspaceRegistry, tmp_path: Path
) -> None:
    source = populated(registry)
    archive = export_workspace(registry, source, tmp_path / "backup.zip")
    with zipfile.ZipFile(archive) as opened:
        names = set(opened.namelist())
        manifest = json.loads(opened.read("manifest.json"))
    assert names == {"manifest.json", "workspace.db", "files/abc/aula.md"}
    assert (manifest["format"], manifest["workspace_name"]) == ("mind-workspace", "Biologia")

    copy = import_workspace(registry, archive)
    assert copy.name == "Biologia (importado)"
    assert import_workspace(registry, archive).name == "Biologia (importado 2)"
    restored = registry.open(copy.id)
    text = (restored.files_dir / "abc" / "aula.md").read_text(encoding="utf-8")
    assert text.startswith("# Célula")
    with restored.sessions() as session:
        assert [m.title for m in session.scalars(select(Material))] == ["Aula"]
        assert [t.name for t in session.scalars(select(Topic))] == ["Célula"]
        assert len(session.scalars(select(ChatMessage)).all()) == 1
        assert session.scalars(select(Item)).all() == []


def test_the_export_is_a_consistent_snapshot(registry: WorkspaceRegistry, tmp_path: Path) -> None:
    archive = export_workspace(registry, populated(registry), tmp_path / "b.zip")
    with zipfile.ZipFile(archive) as opened:
        opened.extract("workspace.db", tmp_path / "x")
    connection = sqlite3.connect(tmp_path / "x" / "workspace.db")
    try:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert connection.execute("SELECT title FROM material").fetchall() == [("Aula",)]
    finally:
        connection.close()


def test_newer_formats_and_unknown_schemas_are_refused(
    registry: WorkspaceRegistry, tmp_path: Path
) -> None:
    archive = export_workspace(registry, populated(registry), tmp_path / "b.zip")
    with pytest.raises(ArchiveIncompatible):
        import_workspace(registry, rewrite(archive, tmp_path / "n.zip", format_version=99))
    with pytest.raises(ArchiveIncompatible):
        import_workspace(registry, rewrite(archive, tmp_path / "s.zip", schema_revision="9999"))
    assert len(registry.list()) == 1  # nothing half-imported


def test_an_older_schema_is_migrated_on_import(registry: WorkspaceRegistry, tmp_path: Path) -> None:
    archive = export_workspace(registry, populated(registry), tmp_path / "b.zip")
    with zipfile.ZipFile(archive) as opened:
        opened.extract("workspace.db", tmp_path / "old")
    connection = sqlite3.connect(tmp_path / "old" / "workspace.db")
    connection.executescript(
        "DROP TABLE chat_message; DROP TABLE chunk_embedding;"
        "UPDATE alembic_version SET version_num='0008';"
    )
    connection.commit()
    connection.close()
    older = tmp_path / "older.zip"
    with zipfile.ZipFile(older, "w") as out:
        out.writestr(
            "manifest.json",
            json.dumps(
                {"format": "mind-workspace", "format_version": 1, "schema_revision": "0008"}
            ),
        )
        out.write(tmp_path / "old" / "workspace.db", "workspace.db")
    copy = import_workspace(registry, older)
    assert copy.name == "Workspace importado"
    with registry.open(copy.id).sessions() as session:
        assert session.scalars(select(ChatMessage)).all() == []  # the table exists again


@pytest.mark.parametrize(
    "member", ["../evil.txt", "/abs.txt", "other/file.txt", "files/../../evil.txt"]
)
def test_unsafe_or_unknown_members_are_refused(
    registry: WorkspaceRegistry, tmp_path: Path, member: str
) -> None:
    archive = export_workspace(registry, populated(registry), tmp_path / "b.zip")
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive) as opened, zipfile.ZipFile(bad, "w") as out:
        for info in opened.infolist():
            out.writestr(info.filename, opened.read(info))
        out.writestr(member, "x")
    with pytest.raises(ArchiveInvalid):
        import_workspace(registry, bad)


def test_files_that_are_not_backups_are_refused(
    registry: WorkspaceRegistry, tmp_path: Path
) -> None:
    text = tmp_path / "x.zip"
    text.write_text("not a zip")
    with pytest.raises(ArchiveInvalid):
        import_workspace(registry, text)
    no_manifest = tmp_path / "m.zip"
    with zipfile.ZipFile(no_manifest, "w") as out:
        out.writestr("workspace.db", "")
    with pytest.raises(ArchiveInvalid):
        import_workspace(registry, no_manifest)
    other = tmp_path / "o.zip"
    with zipfile.ZipFile(other, "w") as out:
        out.writestr("manifest.json", json.dumps({"format": "other"}))
    with pytest.raises(ArchiveInvalid):
        import_workspace(registry, other)
    archive = export_workspace(registry, populated(registry), tmp_path / "b.zip")
    no_db = tmp_path / "d.zip"
    with zipfile.ZipFile(archive) as opened, zipfile.ZipFile(no_db, "w") as out:
        out.writestr("manifest.json", opened.read("manifest.json"))
    with pytest.raises(ArchiveInvalid):
        import_workspace(registry, no_db)
