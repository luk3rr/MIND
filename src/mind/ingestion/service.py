# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Material import, listing and deletion for one workspace."""

from __future__ import annotations

import asyncio
import re
import shutil
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import BinaryIO
from urllib.parse import urlsplit

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.config import Settings
from mind.db.workspace_models import Chunk, Material
from mind.errors import AppError, ExtractionFailed, MaterialNotFound, UnsupportedFile
from mind.ingestion.chunker import ChunkDraft, chunk_segments
from mind.ingestion.extractors import EXTRACTORS, ExtractionResult, Extractor, PdfExtractor
from mind.ingestion.ocr import TesseractEngine
from mind.ingestion.web import PAGE_NAME, HttpPageFetcher, PageFetcher, UrlExtractor, validate_url
from mind.jobs.queue import JobCancelled, JobContext, JobQueue, JobWork
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry

COPY_BLOCK = 1024 * 1024
MAX_FILENAME = 120
UNSAFE = re.compile(r"[^\w.\- ]+", re.UNICODE)
INSERT_BATCH = 500


@dataclass(frozen=True)
class MaterialInfo:
    id: int
    title: str
    kind: str
    filename: str
    status: str
    page_count: int | None
    char_count: int | None
    ocr_confidence: float | None
    job_id: int | None
    error_code: str | None
    error_detail: str | None
    created_at: datetime
    source_url: str | None = None


@dataclass(frozen=True)
class ChunkInfo:
    id: int
    material_id: int
    ordinal: int
    page: int | None
    section: str | None
    text: str


def sanitize_filename(raw: str) -> str:
    """Keep only a safe base name; never trust a path sent by the client."""
    name = Path(raw.replace("\\", "/")).name
    stem, dot, suffix = name.rpartition(".")
    if not dot:
        stem, suffix = name, ""
    cleaned = UNSAFE.sub("_", stem).strip(" .")[:MAX_FILENAME] or "material"
    return f"{cleaned}.{suffix.lower()}" if suffix else cleaned


def _info(row: Material) -> MaterialInfo:
    return MaterialInfo(
        id=row.id,
        title=row.title,
        kind=row.kind,
        filename=row.filename,
        status=row.status,
        page_count=row.page_count,
        char_count=row.char_count,
        ocr_confidence=row.ocr_confidence,
        job_id=row.job_id,
        error_code=row.error_code,
        error_detail=row.error_detail,
        created_at=row.created_at,
        source_url=row.source_url,
    )


class MaterialService:
    def __init__(
        self,
        workspace: OpenWorkspace,
        queue: JobQueue,
        *,
        max_upload_bytes: int,
        extractors: Sequence[Extractor] = EXTRACTORS,
        fetcher: PageFetcher | None = None,
    ) -> None:
        self._workspace = workspace
        self._queue = queue
        self._max_upload_bytes = max_upload_bytes
        self._extractors = extractors
        self._fetcher = fetcher or HttpPageFetcher()

    @property
    def _sessions(self) -> sessionmaker[Session]:
        return self._workspace.sessions

    def _extractor_for(self, filename: str) -> Extractor:
        suffix = Path(filename).suffix.lower()
        for extractor in self._extractors:
            if suffix in extractor.extensions:
                return extractor
        raise UnsupportedFile(
            f"Formato '{suffix or 'sem extensão'}' não suportado. "
            "Use PDF, Word (.docx), Markdown ou texto."
        )

    def _save_upload(self, filename: str, stream: BinaryIO) -> tuple[Path, int]:
        folder = self._workspace.files_dir / uuid.uuid4().hex
        folder.mkdir(parents=True)
        target = folder / filename
        written = 0
        try:
            with target.open("wb") as handle:
                while block := stream.read(COPY_BLOCK):
                    written += len(block)
                    if written > self._max_upload_bytes:
                        limit_mb = self._max_upload_bytes // (1024 * 1024)
                        raise UnsupportedFile(f"O arquivo passa do limite de {limit_mb} MB.")
                    handle.write(block)
        except BaseException:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        return target, written

    def import_file(self, raw_filename: str, stream: BinaryIO) -> MaterialInfo:
        """Store the upload and queue its indexing. Must run inside the event loop."""
        filename = sanitize_filename(raw_filename)
        extractor = self._extractor_for(filename)
        target, _ = self._save_upload(filename, stream)
        relative = target.relative_to(self._workspace.root).as_posix()
        with self._sessions() as session:
            row = Material(
                title=Path(filename).stem,
                kind=extractor.kind,
                filename=filename,
                stored_path=relative,
                status="queued",
            )
            session.add(row)
            session.commit()
            material_id = row.id
        job = self._queue.submit(
            self._workspace.info.id,
            self._sessions,
            "import",
            self._make_work(
                material_id,
                lambda ctx: extractor.extract(target, ctx.update, ctx.check_cancelled),
            ),
        )
        with self._sessions() as session:
            queued = session.get(Material, material_id)
            if queued is not None:
                queued.job_id = job.id
                session.commit()
        return self.get(material_id)

    def import_url(self, raw_url: str) -> MaterialInfo:
        """Queue the download and indexing of a web page. Must run inside the event loop."""
        url = validate_url(raw_url)
        parts = urlsplit(url)
        folder = self._workspace.files_dir / uuid.uuid4().hex
        folder.mkdir(parents=True)
        label = sanitize_filename(f"{parts.netloc}{parts.path}".rstrip("/"))[:MAX_FILENAME]
        with self._sessions() as session:
            row = Material(
                title=parts.netloc,
                kind="url",
                filename=label or parts.netloc,
                stored_path=(folder / PAGE_NAME).relative_to(self._workspace.root).as_posix(),
                status="queued",
                source_url=url,
            )
            session.add(row)
            session.commit()
            material_id = row.id

        def produce(ctx: JobContext) -> ExtractionResult:
            ctx.update(0.1, "baixando a página")
            ctx.check_cancelled()
            fetched = self._fetcher.fetch(url, folder)
            ctx.check_cancelled()
            return UrlExtractor().extract(
                fetched.path, fetched.final_url, ctx.update, ctx.check_cancelled
            )

        job = self._queue.submit(
            self._workspace.info.id, self._sessions, "import", self._make_work(material_id, produce)
        )
        with self._sessions() as session:
            queued = session.get(Material, material_id)
            if queued is not None:
                queued.job_id = job.id
                session.commit()
        return self.get(material_id)

    def _make_work(
        self, material_id: int, produce: Callable[[JobContext], ExtractionResult]
    ) -> JobWork:
        async def work(ctx: JobContext) -> None:
            self._set_status(material_id, "importing")
            try:
                result = await asyncio.to_thread(produce, ctx)
                drafts = chunk_segments(result.segments)
                self._store_chunks(material_id, drafts, result)
            except JobCancelled:
                self._set_status(material_id, "failed", "CANCELLED", "Importação cancelada.")
                raise
            except AppError as exc:
                self._set_status(material_id, "failed", exc.code, exc.detail)
                raise
            except Exception as exc:
                self._set_status(material_id, "failed", "EXTRACTION_FAILED", str(exc))
                raise ExtractionFailed("Falha inesperada ao ler o arquivo.") from exc

        return work

    def _set_status(
        self,
        material_id: int,
        status: str,
        error_code: str | None = None,
        error_detail: str | None = None,
    ) -> None:
        with self._sessions() as session:
            row = session.get(Material, material_id)
            if row is not None:
                row.status = status
                row.error_code, row.error_detail = error_code, error_detail
                session.commit()

    def _store_chunks(
        self,
        material_id: int,
        drafts: list[ChunkDraft],
        result: ExtractionResult,
    ) -> None:
        with self._sessions() as session:
            for start in range(0, len(drafts), INSERT_BATCH):
                session.add_all(
                    Chunk(
                        material_id=material_id,
                        ordinal=start + offset,
                        page=draft.page,
                        section=draft.section,
                        text=draft.text,
                    )
                    for offset, draft in enumerate(drafts[start : start + INSERT_BATCH])
                )
                session.flush()
            row = session.get(Material, material_id)
            if row is not None:
                row.status = "indexed"
                row.page_count = result.page_count
                row.char_count = sum(len(d.text) for d in drafts)
                row.ocr_confidence = result.ocr_confidence
                row.error_code = None
                row.error_detail = " ".join(result.warnings) or None
                if result.title and row.kind == "url":
                    row.title = result.title.strip()[:255] or row.title
            session.commit()

    def list_materials(self) -> list[MaterialInfo]:
        with self._sessions() as session:
            rows = session.scalars(select(Material).order_by(Material.id.desc())).all()
            return [_info(row) for row in rows]

    def get(self, material_id: int) -> MaterialInfo:
        with self._sessions() as session:
            row = session.get(Material, material_id)
            if row is None:
                raise MaterialNotFound(f"Não existe material com id {material_id}.")
            return _info(row)

    def chunks(
        self,
        material_id: int,
        *,
        page: int | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[ChunkInfo]:
        self.get(material_id)
        query = select(Chunk).where(Chunk.material_id == material_id)
        if page is not None:
            query = query.where(Chunk.page == page)
        query = query.order_by(Chunk.ordinal).offset(offset).limit(limit)
        with self._sessions() as session:
            return [
                ChunkInfo(c.id, c.material_id, c.ordinal, c.page, c.section, c.text)
                for c in session.scalars(query)
            ]

    def chunk_count(self, material_id: int) -> int:
        with self._sessions() as session:
            return int(
                session.scalar(
                    select(func.count()).select_from(Chunk).where(Chunk.material_id == material_id)
                )
                or 0
            )

    def delete(self, material_id: int) -> None:
        info = self.get(material_id)
        if info.job_id is not None and info.status in ("queued", "importing"):
            self._queue.cancel(self._workspace.info.id, info.job_id)
        with self._sessions() as session:
            row = session.get(Material, material_id)
            stored = row.stored_path if row else None
            if row is not None:
                session.delete(row)
                session.commit()
        if stored:
            shutil.rmtree((self._workspace.root / stored).parent, ignore_errors=True)


class MaterialsFactory:
    """Builds the `MaterialService` of a workspace on demand."""

    def __init__(
        self,
        registry: WorkspaceRegistry,
        queue: JobQueue,
        settings: Settings,
        fetcher: PageFetcher | None = None,
    ) -> None:
        self._fetcher = fetcher
        self._registry = registry
        self._queue = queue
        self._settings = settings
        self._extractors: tuple[Extractor, ...] = (
            PdfExtractor(TesseractEngine(settings.ocr_langs)),
            *(e for e in EXTRACTORS if e.kind != "pdf"),
        )

    def for_workspace(self, workspace_id: int) -> MaterialService:
        return MaterialService(
            self._registry.open(workspace_id),
            self._queue,
            max_upload_bytes=self._settings.max_upload_mb * 1024 * 1024,
            extractors=self._extractors,
            fetcher=self._fetcher,
        )
