# Filename: test_material_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import asyncio
import io
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import text

from mind.config import Settings
from mind.errors import ExtractionFailed, MaterialNotFound, UnsupportedFile, ValidationFailed
from mind.ingestion.extractors import CancelCheck, ExtractionResult, ProgressCallback, Segment
from mind.ingestion.service import MaterialService, sanitize_filename
from mind.ingestion.web import FetchedPage
from mind.jobs import store
from mind.jobs.queue import JobQueue
from mind.retrieval.retriever import Bm25Retriever
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry
from tests.helpers import ARTICLE, SavedPageFetcher
from tests.ingestion.pdfs import make_pdf


@pytest.fixture
def workspace(tmp_path: Path) -> Iterator[OpenWorkspace]:
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
    yield registry.open(registry.create("Study").id)
    registry.close()


def make_service(workspace: OpenWorkspace, **kwargs: object) -> tuple[MaterialService, JobQueue]:
    queue = JobQueue(progress_interval=0)
    service = MaterialService(workspace, queue, max_upload_bytes=1024 * 1024, **kwargs)  # type: ignore[arg-type]
    return service, queue


async def import_and_wait(
    service: MaterialService, queue: JobQueue, workspace: OpenWorkspace, name: str, data: bytes
) -> int:
    info = service.import_file(name, io.BytesIO(data))
    assert info.job_id is not None
    await queue.wait(workspace.info.id, info.job_id)
    return info.id


async def test_markdown_is_imported_chunked_and_searchable(workspace: OpenWorkspace) -> None:
    service, queue = make_service(workspace)
    content = "# Biologia\n\nA mitocôndria produz energia.\n\n# Física\n\nA massa importa."
    material_id = await import_and_wait(service, queue, workspace, "notes.md", content.encode())

    info = service.get(material_id)
    assert (info.status, info.kind, info.title) == ("indexed", "text", "notes")
    assert info.char_count is not None
    assert info.char_count > 20
    sections = [c.section for c in service.chunks(material_id)]
    assert sections == ["Biologia", "Física"]
    found = Bm25Retriever(workspace.sessions).search("mitocondria")
    assert [(r.material_title, r.section) for r in found] == [("notes", "Biologia")]


async def test_pdf_import_keeps_page_numbers_and_job_progress(
    workspace: OpenWorkspace, tmp_path: Path
) -> None:
    pdf = make_pdf(tmp_path / "src.pdf", ["Primeira página.", "Segunda página com função."])
    service, queue = make_service(workspace)
    material_id = await import_and_wait(service, queue, workspace, "aula.pdf", pdf.read_bytes())

    info = service.get(material_id)
    assert (info.status, info.page_count) == ("indexed", 2)
    assert [c.page for c in service.chunks(material_id)] == [1, 2]
    assert [c.page for c in service.chunks(material_id, page=2)] == [2]
    job = store.get_job(workspace.sessions, info.job_id or 0)
    assert (job.state, job.progress) == ("done", 1.0)
    assert service.chunk_count(material_id) == 2


async def test_corrupted_pdf_marks_material_and_job_as_failed(workspace: OpenWorkspace) -> None:
    service, queue = make_service(workspace)
    material_id = await import_and_wait(service, queue, workspace, "bad.pdf", b"not a pdf")

    info = service.get(material_id)
    assert (info.status, info.error_code) == ("failed", "EXTRACTION_FAILED")
    job = store.get_job(workspace.sessions, info.job_id or 0)
    assert (job.state, job.error_code) == ("failed", "EXTRACTION_FAILED")
    assert service.chunk_count(material_id) == 0


def test_unsupported_extensions_are_refused_without_leaving_files(
    workspace: OpenWorkspace,
) -> None:
    service, _ = make_service(workspace)
    with pytest.raises(UnsupportedFile):
        service.import_file("slides.pptx", io.BytesIO(b"x"))
    with pytest.raises(UnsupportedFile):
        service.import_file("noextension", io.BytesIO(b"x"))
    assert not any(workspace.files_dir.iterdir())
    assert service.list_materials() == []


def test_oversized_uploads_are_refused_and_cleaned_up(workspace: OpenWorkspace) -> None:
    service, _ = make_service(workspace)
    with pytest.raises(UnsupportedFile, match="limite"):
        service.import_file("big.txt", io.BytesIO(b"x" * (1024 * 1024 + 1)))
    assert not any(workspace.files_dir.iterdir())


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd.pdf", "passwd.pdf"),
        ("C:\\Users\\me\\Aula 1.PDF", "Aula 1.pdf"),
        ("we<ird>:name?.md", "we_ird_name_.md"),
        ("...", "material"),
        ("", "material"),
        ("a" * 300 + ".txt", "a" * 120 + ".txt"),
    ],
)
def test_filenames_are_sanitized(raw: str, expected: str) -> None:
    assert sanitize_filename(raw) == expected


async def test_stored_file_stays_inside_the_workspace(workspace: OpenWorkspace) -> None:
    service, queue = make_service(workspace)
    material_id = await import_and_wait(service, queue, workspace, "../../evil.txt", b"hello")
    stored = workspace.root / service_stored_path(workspace, material_id)
    assert stored.resolve().is_relative_to(workspace.files_dir.resolve())
    assert stored.name == "evil.txt"


def service_stored_path(workspace: OpenWorkspace, material_id: int) -> str:
    with workspace.engine.connect() as conn:
        row = conn.execute(
            text("SELECT stored_path FROM material WHERE id = :id"), {"id": material_id}
        ).scalar_one()
    return str(row)


async def test_delete_removes_row_chunks_index_and_files(workspace: OpenWorkspace) -> None:
    service, queue = make_service(workspace)
    material_id = await import_and_wait(service, queue, workspace, "n.txt", b"unique term here")
    stored = workspace.root / service_stored_path(workspace, material_id)
    assert stored.exists()
    assert Bm25Retriever(workspace.sessions).search("unique")

    service.delete(material_id)

    assert not stored.parent.exists()
    assert service.list_materials() == []
    assert Bm25Retriever(workspace.sessions).search("unique") == []
    with pytest.raises(MaterialNotFound):
        service.get(material_id)
    with pytest.raises(MaterialNotFound):
        service.delete(material_id)


async def test_list_is_newest_first_and_chunks_paginate(workspace: OpenWorkspace) -> None:
    service, queue = make_service(workspace)
    first = await import_and_wait(service, queue, workspace, "a.txt", b"one")
    second = await import_and_wait(service, queue, workspace, "b.md", b"# T\n\ntwo")
    assert [m.id for m in service.list_materials()] == [second, first]
    assert service.chunks(first, offset=1) == []
    with pytest.raises(MaterialNotFound):
        service.chunks(999)


class SlowExtractor:
    kind = "text"
    extensions = (".txt",)

    def extract(
        self,
        path: Path,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult:
        for step in range(200):
            if check_cancelled is not None:
                check_cancelled()
            time.sleep(0.01)
            if progress is not None:
                progress(step / 200, "working")
        return ExtractionResult(segments=[Segment("late")])


async def test_deleting_a_material_that_is_importing_cancels_the_job(
    workspace: OpenWorkspace,
) -> None:
    service, queue = make_service(workspace, extractors=[SlowExtractor()])
    info = service.import_file("slow.txt", io.BytesIO(b"x"))
    await asyncio.sleep(0.1)
    assert service.get(info.id).status == "importing"
    service.delete(info.id)
    await queue.wait(workspace.info.id, info.job_id or 0)
    assert store.get_job(workspace.sessions, info.job_id or 0).state == "cancelled"
    assert service.list_materials() == []


async def test_unexpected_extractor_errors_become_extraction_failed(
    workspace: OpenWorkspace,
) -> None:
    class Exploding(SlowExtractor):
        def extract(
            self,
            path: Path,
            progress: ProgressCallback | None = None,
            check_cancelled: CancelCheck | None = None,
        ) -> ExtractionResult:
            raise RuntimeError("boom")

    service, queue = make_service(workspace, extractors=[Exploding()])
    info = service.import_file("x.txt", io.BytesIO(b"x"))
    await queue.wait(workspace.info.id, info.job_id or 0)
    assert service.get(info.id).error_code == "EXTRACTION_FAILED"


# --- OCR, Word and web pages -------------------------------------------------------------------


class FailingFetcher:
    def fetch(self, url: str, folder: Path) -> FetchedPage:
        raise ExtractionFailed("A página respondeu HTTP 404.")


async def test_a_word_document_is_imported_with_its_sections(workspace: OpenWorkspace) -> None:
    import docx

    document = docx.Document()
    document.add_heading("Biologia", level=1)
    document.add_paragraph("A mitocôndria produz energia.")
    buffer = io.BytesIO()
    document.save(buffer)
    service, queue = make_service(workspace)

    material_id = await import_and_wait(service, queue, workspace, "aula.docx", buffer.getvalue())

    info = service.get(material_id)
    assert (info.status, info.kind, info.title) == ("indexed", "docx", "aula")
    assert [c.section for c in service.chunks(material_id)] == ["Biologia"]


async def test_a_scanned_pdf_goes_through_ocr_and_keeps_its_confidence(
    workspace: OpenWorkspace, tmp_path: Path
) -> None:
    from mind.ingestion.extractors import PdfExtractor
    from mind.ingestion.ocr import OcrPage
    from tests.ingestion.test_ocr import FakeOcr

    pdf = make_pdf(tmp_path / "scan.pdf", ["", ""])
    ocr = FakeOcr(
        [
            OcrPage("Primeira página lida por OCR do material.", 0.9),
            OcrPage("Segunda página, lida também.", 0.6),
        ]
    )
    service, queue = make_service(workspace, extractors=[PdfExtractor(ocr)])

    material_id = await import_and_wait(service, queue, workspace, "scan.pdf", pdf.read_bytes())

    info = service.get(material_id)
    assert (info.status, info.page_count) == ("indexed", 2)
    assert info.ocr_confidence == pytest.approx(0.75)
    assert [c.page for c in service.chunks(material_id)] == [1, 2]


async def test_a_scanned_pdf_without_an_engine_fails_with_the_ocr_code(
    workspace: OpenWorkspace, tmp_path: Path
) -> None:
    from mind.ingestion.extractors import PdfExtractor

    pdf = make_pdf(tmp_path / "scan.pdf", [""])
    service, queue = make_service(workspace, extractors=[PdfExtractor(None)])
    material_id = await import_and_wait(service, queue, workspace, "scan.pdf", pdf.read_bytes())

    info = service.get(material_id)
    assert (info.status, info.error_code) == ("failed", "OCR_UNAVAILABLE")
    assert store.get_job(workspace.sessions, info.job_id or 0).error_code == "OCR_UNAVAILABLE"


async def test_warnings_of_an_indexed_pdf_are_kept_as_a_note(
    workspace: OpenWorkspace, tmp_path: Path
) -> None:
    from mind.ingestion.extractors import PdfExtractor

    pdf = make_pdf(tmp_path / "mixed.pdf", ["Uma página com texto nativo suficiente.", ""])
    service, queue = make_service(workspace, extractors=[PdfExtractor(None)])
    material_id = await import_and_wait(service, queue, workspace, "mixed.pdf", pdf.read_bytes())

    info = service.get(material_id)
    assert info.status == "indexed"
    assert info.error_code is None
    assert info.error_detail == "1 página(s) sem texto foram ignoradas (OCR indisponível)."


async def test_a_url_is_downloaded_indexed_and_remembered(workspace: OpenWorkspace) -> None:
    fetcher = SavedPageFetcher(ARTICLE)
    queue = JobQueue(progress_interval=0)
    service = MaterialService(workspace, queue, max_upload_bytes=10**6, fetcher=fetcher)

    info = service.import_url("  https://exemplo.org/artigo ")
    assert (info.kind, info.status, info.source_url) == (
        "url",
        "queued",
        "https://exemplo.org/artigo",
    )
    assert info.title == "exemplo.org"
    await queue.wait(workspace.info.id, info.job_id or 0)

    done = service.get(info.id)
    assert (done.status, done.title) == ("indexed", "Fotossíntese")
    assert fetcher.requested == ["https://exemplo.org/artigo"]
    texts = " ".join(c.text for c in service.chunks(info.id))
    assert "cloroplastos" in texts
    assert (workspace.root / service_stored_path(workspace, info.id)).exists()
    found = Bm25Retriever(workspace.sessions).search("cloroplastos")
    assert [r.material_id for r in found] == [info.id]


async def test_a_failed_download_marks_the_material_and_the_job(workspace: OpenWorkspace) -> None:
    queue = JobQueue(progress_interval=0)
    service = MaterialService(workspace, queue, max_upload_bytes=10**6, fetcher=FailingFetcher())
    info = service.import_url("https://exemplo.org/sumiu")
    await queue.wait(workspace.info.id, info.job_id or 0)

    failed = service.get(info.id)
    assert (failed.status, failed.error_code, failed.error_detail) == (
        "failed",
        "EXTRACTION_FAILED",
        "A página respondeu HTTP 404.",
    )


def test_invalid_urls_never_create_a_material(workspace: OpenWorkspace) -> None:
    service, _ = make_service(workspace)
    for bad in ("", "ftp://x.org/a", "file:///etc/passwd", "https://u:p@x.org/"):
        with pytest.raises(ValidationFailed):
            service.import_url(bad)
    assert service.list_materials() == []
    assert not any(workspace.files_dir.iterdir())
