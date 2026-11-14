# Filename: test_sm1_real.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Optional end-to-end check with a real model (run with `pytest -m real_llm`).

It needs `OPENROUTER_API_KEY` in the environment, spends a few cents and measures the part of
SM-1 that does not need a human: how many cards survive the automatic source checks.
"""

import io
import os
from pathlib import Path

import pytest

from mind.config import Settings
from mind.generation.service import GenerationRequest, GenerationService
from mind.ingestion.service import MaterialService
from mind.jobs.queue import JobQueue
from mind.services import Services
from mind.workspaces.registry import WorkspaceRegistry

SAMPLE = Path(__file__).with_name("sample_text.md")
MIN_YIELD = 0.6

needs_key = pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="no API key")


@pytest.mark.real_llm
@needs_key
async def test_a_real_model_produces_cards_that_pass_the_source_checks(tmp_path: Path) -> None:
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
    services = Services.build(Settings(data_dir=tmp_path), registry)
    services.consent.give("openrouter")
    workspace = registry.open(registry.create("Real").id)
    queue = JobQueue()
    material = MaterialService(workspace, queue, max_upload_bytes=10**6).import_file(
        "fotossintese.md", io.BytesIO(SAMPLE.read_bytes())
    )
    await queue.wait(workspace.info.id, material.job_id or 0)

    service = GenerationService(workspace, queue, services)
    run = service.start(GenerationRequest(material.id, "qa", quantity=10))
    await queue.wait(workspace.info.id, run.job_id or 0)
    done = service.get(run.id)
    await services.aclose()
    registry.close()

    produced = done.generated + done.discarded_no_source + done.discarded_invalid
    print(f"\nreal model: {done.generated}/{produced} valid, cost US$ {done.cost_usd:.4f}")
    print(f"discards: {done.discard_log}")
    assert done.status == "done"
    assert done.generated / produced >= MIN_YIELD
