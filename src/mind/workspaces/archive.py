# Filename: archive.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Export a workspace to a `.zip` and import it back (FR-22).

Layout: `manifest.json`, `workspace.db` (a consistent snapshot) and `files/...` (the originals).
The API key and the global settings are never part of an archive.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO

from mind import __version__
from mind.db import migrate
from mind.errors import ArchiveIncompatible, ArchiveInvalid, ValidationFailed
from mind.workspaces.registry import WorkspaceInfo, WorkspaceRegistry

FORMAT = "mind-workspace"
FORMAT_VERSION = 1
MANIFEST = "manifest.json"
DATABASE = "workspace.db"
FILES = "files"
MAX_UNPACKED_BYTES = 8 * 1024**3
MAX_MEMBERS = 100_000


def export_workspace(registry: WorkspaceRegistry, workspace_id: int, target: Path) -> Path:
    """Write the archive of a workspace to `target` and return it."""
    workspace = registry.open(workspace_id)
    revision = migrate.current_revision(workspace.engine)
    with tempfile.TemporaryDirectory() as scratch:
        snapshot = Path(scratch) / DATABASE
        source = sqlite3.connect(workspace.root / DATABASE)
        copy = sqlite3.connect(snapshot)
        try:
            source.backup(copy)  # consistent even while the WAL has pending pages
        finally:
            copy.close()
            source.close()
        manifest: dict[str, Any] = {
            "format": FORMAT,
            "format_version": FORMAT_VERSION,
            "app_version": __version__,
            "schema_revision": revision,
            "workspace_name": workspace.info.name,
            "exported_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(MANIFEST, json.dumps(manifest, indent=2, ensure_ascii=False))
            archive.write(snapshot, DATABASE)
            files = workspace.files_dir
            for path in sorted(files.rglob("*")):
                if path.is_file():
                    archive.write(path, f"{FILES}/{path.relative_to(files).as_posix()}")
    return target


def _read_manifest(archive: zipfile.ZipFile) -> dict[str, Any]:
    try:
        manifest = json.loads(archive.read(MANIFEST))
    except (KeyError, ValueError) as exc:
        raise ArchiveInvalid("O arquivo não tem um manifest.json válido.") from exc
    if not isinstance(manifest, dict) or manifest.get("format") != FORMAT:
        raise ArchiveInvalid("O arquivo não é um backup de workspace do MIND.")
    version = manifest.get("format_version")
    if not isinstance(version, int) or version > FORMAT_VERSION:
        raise ArchiveIncompatible(
            "Este backup vem de uma versão mais nova do MIND. Atualize o app para importá-lo."
        )
    known = migrate.known_revisions("workspace")
    if manifest.get("schema_revision") not in known:
        raise ArchiveIncompatible(
            "O banco do backup tem uma versão desconhecida; atualize o MIND e tente de novo."
        )
    return manifest


def _check_members(archive: zipfile.ZipFile) -> None:
    infos = archive.infolist()
    if len(infos) > MAX_MEMBERS or sum(i.file_size for i in infos) > MAX_UNPACKED_BYTES:
        raise ArchiveInvalid("O backup é grande demais.")
    names = {i.filename for i in infos}
    if DATABASE not in names:
        raise ArchiveInvalid("O backup não contém o banco de dados.")
    for name in names:
        path = PurePosixPath(name.rstrip("/"))
        inside_files = path.parts[:1] == (FILES,)
        allowed = name in (MANIFEST, DATABASE) or inside_files
        if path.is_absolute() or ".." in path.parts or "\\" in name or not allowed:
            raise ArchiveInvalid(f"O backup contém um caminho não permitido: {name!r}.")


def import_workspace(registry: WorkspaceRegistry, source: Path) -> WorkspaceInfo:
    """Create a new workspace from an archive. The name gets a suffix if it is taken."""
    try:
        archive = zipfile.ZipFile(source)
    except (zipfile.BadZipFile, OSError) as exc:
        raise ArchiveInvalid("O arquivo não é um .zip válido.") from exc
    with archive:
        manifest = _read_manifest(archive)
        _check_members(archive)
        base = str(manifest.get("workspace_name") or "Workspace importado")

        def populate(root: Path) -> None:
            for info in archive.infolist():
                if info.filename == MANIFEST or info.is_dir():
                    continue
                destination = root / info.filename
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as reader, destination.open("wb") as writer:
                    while chunk := reader.read(1024 * 1024):
                        writer.write(chunk)

        suffix = 0
        while True:
            name = (
                base if suffix == 0 else f"{base} (importado{'' if suffix == 1 else f' {suffix}'})"
            )
            try:
                return registry.create_from(name, populate)
            except ValidationFailed as exc:
                if not any(e.field == "name" for e in exc.errors) or suffix >= 50:
                    raise
                suffix += 1


def export_to_temp(registry: WorkspaceRegistry, workspace_id: int) -> Path:
    """Export into a new temporary file; the caller deletes it after sending it."""
    handle, name = tempfile.mkstemp(prefix="mind-export-", suffix=".zip")
    os.close(handle)
    try:
        return export_workspace(registry, workspace_id, Path(name))
    except Exception:
        Path(name).unlink(missing_ok=True)
        raise


def import_upload(registry: WorkspaceRegistry, content: BinaryIO) -> WorkspaceInfo:
    """Import an uploaded archive (the stream is copied to a temporary file first)."""
    handle, name = tempfile.mkstemp(prefix="mind-import-", suffix=".zip")
    path = Path(name)
    try:
        with os.fdopen(handle, "wb") as out:
            shutil.copyfileobj(content, out)
        return import_workspace(registry, path)
    finally:
        path.unlink(missing_ok=True)


def download_name(info: WorkspaceInfo) -> str:
    """A safe file name such as `mind-biologia-2026-11-14.zip`."""
    slug = (
        "".join(c if c.isalnum() else "-" for c in info.name.casefold()).strip("-") or "workspace"
    )
    return f"mind-{slug}-{datetime.now(UTC):%Y-%m-%d}.zip"
