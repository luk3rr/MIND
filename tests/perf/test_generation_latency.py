# Filename: test_generation_latency.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import asyncio
import io
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

from mind.config import Settings
from mind.generation.schemas import CardBatch, JudgeBatch, QuestionBatch
from mind.generation.service import GenerationRequest, GenerationService
from mind.ingestion.service import MaterialService
from mind.jobs.queue import JobQueue
from mind.llm.fake import FakeProvider
from mind.services import Services
from mind.workspaces.registry import WorkspaceRegistry
from tests.generation.fakes import (
    cards_from_prompt,
    judge_supports_everything,
    questions_from_prompt,
)

MAX_SECONDS = 60
MODEL_LATENCY = 1.0  # seconds per model call, a conservative stand-in for a real provider
MAX_LOOP_LAG = 0.25
TEXT = "\n\n".join(
    f"# Capítulo {i}\n\n"
    + "A mitocôndria produz energia para a célula e participa da respiração. " * 40
    for i in range(12)
)


@pytest.fixture
def registry(tmp_path: Path) -> Iterator[WorkspaceRegistry]:
    reg = WorkspaceRegistry(Settings(data_dir=tmp_path))
    yield reg
    reg.close()


@pytest.mark.perf
async def test_twenty_cards_are_generated_quickly_without_blocking_the_event_loop(
    registry: WorkspaceRegistry, tmp_path: Path
) -> None:
    fake = FakeProvider(name="openrouter", requires_consent=False, latency=MODEL_LATENCY)
    fake.script(CardBatch, cards_from_prompt)
    services = Services.build(Settings(data_dir=tmp_path), registry, inner_provider=fake)
    workspace = registry.open(registry.create("Perf").id)
    queue = JobQueue()
    material = MaterialService(workspace, queue, max_upload_bytes=10**7).import_file(
        "aula.md", io.BytesIO(TEXT.encode())
    )
    await queue.wait(workspace.info.id, material.job_id or 0)

    worst_lag = 0.0
    running = True

    async def watch_the_loop() -> None:
        nonlocal worst_lag
        while running:
            before = time.perf_counter()
            await asyncio.sleep(0.05)
            worst_lag = max(worst_lag, time.perf_counter() - before - 0.05)

    watcher = asyncio.create_task(watch_the_loop())
    service = GenerationService(workspace, queue, services)
    started = time.perf_counter()
    run = service.start(GenerationRequest(material.id, "qa", quantity=20))
    await queue.wait(workspace.info.id, run.job_id or 0)
    elapsed = time.perf_counter() - started
    running = False
    await watcher

    done = service.get(run.id)
    print(f"\n20 cards: {elapsed:.2f}s with {MODEL_LATENCY}s per call, loop lag {worst_lag:.3f}s")
    assert (done.status, done.generated) == ("done", 20)
    assert elapsed < MAX_SECONDS
    assert worst_lag < MAX_LOOP_LAG
    await services.aclose()


@pytest.mark.perf
async def test_ten_questions_with_the_judge_stay_within_the_limit(
    registry: WorkspaceRegistry, tmp_path: Path
) -> None:
    fake = FakeProvider(name="openrouter", requires_consent=False, latency=MODEL_LATENCY)
    fake.script(QuestionBatch, questions_from_prompt)
    fake.script(JudgeBatch, judge_supports_everything)
    services = Services.build(Settings(data_dir=tmp_path), registry, inner_provider=fake)
    workspace = registry.open(registry.create("PerfQ").id)
    queue = JobQueue()
    material = MaterialService(workspace, queue, max_upload_bytes=10**7).import_file(
        "aula.md", io.BytesIO(TEXT.encode())
    )
    await queue.wait(workspace.info.id, material.job_id or 0)

    service = GenerationService(workspace, queue, services)
    started = time.perf_counter()
    run = service.start(GenerationRequest(material.id, "multiple_choice_4", 10, kind="question"))
    await queue.wait(workspace.info.id, run.job_id or 0)
    elapsed = time.perf_counter() - started

    done = service.get(run.id)
    print(f"\n10 questions + judge: {elapsed:.2f}s with {MODEL_LATENCY}s per call")
    assert (done.status, done.generated) == ("done", 10)
    assert elapsed < MAX_SECONDS
    await services.aclose()
