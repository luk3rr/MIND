# Filename: test_import_100_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import io
import resource
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from mind.config import Settings
from mind.ingestion.service import MaterialService
from mind.jobs.queue import JobQueue
from mind.retrieval.retriever import Bm25Retriever
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry
from tests.ingestion.pdfs import make_pdf

MAX_SECONDS = 60
MAX_MEMORY_KB = 4 * 1024 * 1024  # 4 GB, in the KB that ru_maxrss reports on Linux
SENTENCE = (
    "A célula é a unidade básica da vida e contém organelas responsáveis pela produção de "
    "energia, pela síntese de proteínas e pelo armazenamento da informação genética. "
)


@pytest.fixture
def workspace(tmp_path: Path) -> Iterator[OpenWorkspace]:
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
    yield registry.open(registry.create("Perf").id)
    registry.close()


@pytest.mark.perf
async def test_a_100_page_pdf_is_indexed_within_the_limits(
    workspace: OpenWorkspace, tmp_path: Path
) -> None:
    pages = [f"Página {number}. " + SENTENCE * 12 for number in range(1, 101)]
    pdf = make_pdf(tmp_path / "hundred.pdf", pages, fontsize=9)
    queue = JobQueue()
    service = MaterialService(workspace, queue, max_upload_bytes=200 * 1024 * 1024)

    started = time.perf_counter()
    info = service.import_file("hundred.pdf", io.BytesIO(pdf.read_bytes()))
    assert info.job_id is not None
    await queue.wait(workspace.info.id, info.job_id)
    elapsed = time.perf_counter() - started

    indexed = service.get(info.id)
    peak_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(
        f"\n100-page import: {elapsed:.2f}s, chunks={service.chunk_count(info.id)}, "
        f"peak memory={peak_kb / 1024:.0f} MB"
    )

    assert indexed.status == "indexed"
    assert indexed.page_count == 100
    assert elapsed < MAX_SECONDS
    assert peak_kb < MAX_MEMORY_KB
    assert Bm25Retriever(workspace.sessions).search("organelas", limit=5)
