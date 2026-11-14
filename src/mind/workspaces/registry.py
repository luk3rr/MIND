# Filename: registry.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Workspace registry: create, list, rename, delete and open each workspace."""

from __future__ import annotations

import logging
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import Engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from mind.config import Settings
from mind.db import migrate
from mind.db.app_models import Workspace
from mind.db.base import make_session_factory
from mind.errors import FieldError, ValidationFailed, WorkspaceNotFound
from mind.jobs.store import recover_interrupted

logger = logging.getLogger(__name__)

MAX_NAME_LENGTH = 80


@dataclass(frozen=True)
class WorkspaceInfo:
    id: int
    name: str
    created_at: datetime


@dataclass
class OpenWorkspace:
    """Access to an open workspace: engine, sessions and files folder."""

    info: WorkspaceInfo
    engine: Engine
    sessions: sessionmaker[Session]
    root: Path

    @property
    def files_dir(self) -> Path:
        return self.root / "files"


def normalize_name(raw: str) -> tuple[str, str]:
    """Validate the name and return (clean name, case-insensitive uniqueness key)."""
    name = " ".join(raw.split())
    if not name:
        raise ValidationFailed(
            "O nome do workspace não pode ser vazio.",
            errors=[FieldError("name", "Informe um nome.")],
        )
    if len(name) > MAX_NAME_LENGTH:
        raise ValidationFailed(
            f"O nome pode ter no máximo {MAX_NAME_LENGTH} caracteres.",
            errors=[FieldError("name", f"No máximo {MAX_NAME_LENGTH} caracteres.")],
        )
    return name, name.casefold()


class WorkspaceRegistry:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        settings.workspaces_dir.mkdir(parents=True, exist_ok=True)
        self._app_engine = migrate.upgrade("app", settings.app_db_path)
        self._sessions = make_session_factory(self._app_engine)
        self._open: dict[int, OpenWorkspace] = {}
        self._remove_orphan_folders()

    def close(self) -> None:
        for workspace in self._open.values():
            workspace.engine.dispose()
        self._open.clear()
        self._app_engine.dispose()

    def _folder_path(self, folder: str) -> Path:
        base = self._settings.workspaces_dir.resolve()
        path = (base / folder).resolve()
        if path.parent != base:
            raise ValidationFailed("Pasta de workspace inválida.")
        return path

    def _remove_orphan_folders(self) -> None:
        with self._sessions() as session:
            known = set(session.scalars(select(Workspace.folder)))
        for child in self._settings.workspaces_dir.iterdir():
            if child.is_dir() and child.name not in known:
                logger.warning("Removing orphan workspace folder: %s", child.name)
                shutil.rmtree(child, ignore_errors=True)

    @staticmethod
    def _info(row: Workspace) -> WorkspaceInfo:
        return WorkspaceInfo(id=row.id, name=row.name, created_at=row.created_at)

    def create(self, raw_name: str) -> WorkspaceInfo:
        name, key = normalize_name(raw_name)
        with self._sessions() as session:
            if session.scalar(select(Workspace.id).where(Workspace.name_key == key)):
                raise ValidationFailed(
                    "Já existe um workspace com esse nome.",
                    errors=[FieldError("name", "Nome já em uso.")],
                )
        folder = uuid.uuid4().hex
        root = self._folder_path(folder)
        try:
            (root / "files").mkdir(parents=True)
            migrate.upgrade("workspace", root / "workspace.db").dispose()
            with self._sessions() as session:
                row = Workspace(name=name, name_key=key, folder=folder)
                session.add(row)
                session.commit()
                return self._info(row)
        except IntegrityError as exc:
            shutil.rmtree(root, ignore_errors=True)
            raise ValidationFailed(
                "Já existe um workspace com esse nome.",
                errors=[FieldError("name", "Nome já em uso.")],
            ) from exc
        except Exception:
            shutil.rmtree(root, ignore_errors=True)
            raise

    def list(self) -> list[WorkspaceInfo]:
        with self._sessions() as session:
            rows = session.scalars(select(Workspace).order_by(Workspace.name_key)).all()
            return [self._info(row) for row in rows]

    def get(self, workspace_id: int) -> WorkspaceInfo:
        with self._sessions() as session:
            row = session.get(Workspace, workspace_id)
            if row is None:
                raise WorkspaceNotFound(f"Não existe workspace com id {workspace_id}.")
            return self._info(row)

    def rename(self, workspace_id: int, raw_name: str) -> WorkspaceInfo:
        name, key = normalize_name(raw_name)
        with self._sessions() as session:
            row = session.get(Workspace, workspace_id)
            if row is None:
                raise WorkspaceNotFound(f"Não existe workspace com id {workspace_id}.")
            clash = session.scalar(
                select(Workspace.id).where(Workspace.name_key == key, Workspace.id != workspace_id)
            )
            if clash:
                raise ValidationFailed(
                    "Já existe um workspace com esse nome.",
                    errors=[FieldError("name", "Nome já em uso.")],
                )
            row.name, row.name_key = name, key
            session.commit()
            self._open.pop(workspace_id, None)
            return self._info(row)

    def delete(self, workspace_id: int) -> None:
        with self._sessions() as session:
            row = session.get(Workspace, workspace_id)
            if row is None:
                raise WorkspaceNotFound(f"Não existe workspace com id {workspace_id}.")
            folder = row.folder
            session.delete(row)
            session.commit()
        opened = self._open.pop(workspace_id, None)
        if opened is not None:
            opened.engine.dispose()
        try:
            shutil.rmtree(self._folder_path(folder))
        except OSError:
            logger.warning(
                "Could not delete folder %s; it will be removed on the next start.", folder
            )

    def open(self, workspace_id: int) -> OpenWorkspace:
        cached = self._open.get(workspace_id)
        if cached is not None:
            return cached
        with self._sessions() as session:
            row = session.get(Workspace, workspace_id)
            if row is None:
                raise WorkspaceNotFound(f"Não existe workspace com id {workspace_id}.")
            info, folder = self._info(row), row.folder
        root = self._folder_path(folder)
        engine = migrate.upgrade("workspace", root / "workspace.db")
        sessions = make_session_factory(engine)
        recover_interrupted(sessions)
        opened = OpenWorkspace(info, engine, sessions, root)
        self._open[workspace_id] = opened
        return opened
