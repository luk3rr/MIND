# Filename: test_generation_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import asyncio
import io
import re
from collections.abc import Iterator, Sequence
from pathlib import Path

import pytest
from sqlalchemy import select

from mind.config import Settings
from mind.db.app_models import ModelPrice
from mind.db.workspace_models import Chunk, Item
from mind.errors import (
    ConsentRequired,
    GenerationRunNotFound,
    MaterialNotFound,
    MonthlyLimitReached,
    ProviderError,
    ProviderKeyMissing,
    ValidationFailed,
)
from mind.generation.schemas import CardBatch, CardOut, SourceRef
from mind.generation.service import GenerationRequest, GenerationService
from mind.ingestion.service import MaterialService
from mind.jobs import store
from mind.jobs.queue import JobQueue
from mind.llm.fake import FakeProvider
from mind.llm.types import Message, Usage
from mind.services import Services
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry

PARAGRAPH = "A mitocôndria produz energia para a célula e participa da respiração. " * 40
TEXT = "\n\n".join(f"# Capítulo {i}\n\n{PARAGRAPH}" for i in range(12))


class Env:
    def __init__(self, tmp_path: Path) -> None:
        self.registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
        self.fake = FakeProvider(name="openrouter", requires_consent=False)
        self.services = Services.build(
            Settings(data_dir=tmp_path), self.registry, inner_provider=self.fake
        )
        self.queue = JobQueue(progress_interval=0)
        self.workspace: OpenWorkspace = self.registry.open(self.registry.create("Gen").id)
        self.materials = MaterialService(self.workspace, self.queue, max_upload_bytes=10**7)
        self.generation = GenerationService(self.workspace, self.queue, self.services)

    async def import_material(self, text: str = TEXT) -> int:
        info = self.materials.import_file("aula.md", io.BytesIO(text.encode()))
        await self.queue.wait(self.workspace.info.id, info.job_id or 0)
        return info.id

    def script_valid_cards(self) -> None:
        """Answer every batch with cards that quote the first chunk of the prompt."""

        def handler(messages: Sequence[Message], model: str) -> CardBatch:
            user = messages[-1].content
            count = int(re.search(r"Create exactly (\d+)", user).group(1))  # type: ignore[union-attr]
            chunk_id = int(re.search(r"\[excerpt (\d+) \|", user).group(1))  # type: ignore[union-attr]
            with self.workspace.sessions() as session:
                chunk = session.get(Chunk, chunk_id)
                assert chunk is not None
                quote = chunk.text[:60]
            return CardBatch(
                cards=[
                    CardOut(
                        subtype="qa",
                        front=f"Pergunta {chunk_id}-{n}?",
                        back="Resposta.",
                        topic="Biologia",
                        source=SourceRef(chunk_id=chunk_id, quote=quote),
                    )
                    for n in range(count)
                ]
            )

        self.fake.script(CardBatch, handler)

    def close(self) -> None:
        self.registry.close()


@pytest.fixture
def env(tmp_path: Path) -> Iterator[Env]:
    environment = Env(tmp_path)
    yield environment
    environment.close()


async def wait_run(env: Env, run_id: int) -> None:
    job_id = env.generation.get(run_id).job_id or 0
    await env.queue.wait(env.workspace.info.id, job_id)


async def test_a_run_generates_exactly_the_requested_drafts(env: Env) -> None:
    material_id = await env.import_material()
    env.script_valid_cards()
    env.fake.usage = Usage(prompt_tokens=100, completion_tokens=50, cost_usd=0.01)

    run = env.generation.start(GenerationRequest(material_id, "qa", quantity=10))
    assert run.status == "queued"
    await wait_run(env, run.id)

    done = env.generation.get(run.id)
    assert (done.status, done.generated, done.requested) == ("done", 10, 10)
    assert done.cost_usd == pytest.approx(0.01 * len(env.fake.calls))
    assert done.model == env.services.settings.get().generation_model
    assert done.finished_at is not None
    job = store.get_job(env.workspace.sessions, done.job_id or 0)
    assert (job.state, job.progress) == ("done", 1.0)
    with env.workspace.sessions() as session:
        stored = list(session.scalars(select(Item)))
    assert len(stored) == 10
    assert {i.status for i in stored} == {"draft"}
    assert len(env.fake.calls) == 2  # ceil(10 / 5) batches


async def test_invalid_cards_are_counted_with_reasons_in_the_run(env: Env) -> None:
    material_id = await env.import_material("# T\n\n" + PARAGRAPH)

    def handler(messages: Sequence[Message], model: str) -> CardBatch:
        chunk_id = int(re.search(r"\[excerpt (\d+) \|", messages[-1].content).group(1))  # type: ignore[union-attr]
        good = CardOut(
            subtype="qa", front="Boa pergunta?", back="Resposta.", topic=None,
            source=SourceRef(chunk_id=chunk_id, quote="A mitocôndria produz energia para a célula"),
        )  # fmt: skip
        invented = good.model_copy(
            update={
                "front": "Inventada?",
                "source": SourceRef(chunk_id=chunk_id, quote="texto que não existe no material"),
            }
        )
        return CardBatch(cards=[good, invented, good])

    env.fake.script(CardBatch, handler)
    run = env.generation.start(GenerationRequest(material_id, "qa", quantity=3))
    await wait_run(env, run.id)

    done = env.generation.get(run.id)
    assert (done.generated, done.discarded_no_source, done.discarded_duplicate) == (1, 1, 1)
    assert {entry["reason"] for entry in done.discard_log} == {"quote_not_in_chunk", "duplicate"}


async def test_a_provider_failure_keeps_partial_results_and_fails_the_job(env: Env) -> None:
    material_id = await env.import_material()
    env.script_valid_cards()
    inner = env.fake._handlers[CardBatch]
    calls = 0

    def flaky(messages: Sequence[Message], model: str) -> CardBatch:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ProviderError("sem resposta do modelo")
        return inner(messages, model)  # type: ignore[return-value]

    env.fake.script(CardBatch, flaky)
    run = env.generation.start(GenerationRequest(material_id, "qa", quantity=15))
    await wait_run(env, run.id)

    done = env.generation.get(run.id)
    assert done.status == "partial"
    assert done.error_code == "PROVIDER_ERROR"
    assert 0 < done.generated < 15
    assert store.get_job(env.workspace.sessions, done.job_id or 0).state == "failed"


async def test_cancelling_the_job_stops_the_run(env: Env) -> None:
    material_id = await env.import_material()
    env.script_valid_cards()
    env.fake.latency = 0.2
    run = env.generation.start(GenerationRequest(material_id, "qa", quantity=30))
    await asyncio.sleep(0.05)
    assert env.queue.cancel(env.workspace.info.id, run.job_id or 0)
    await wait_run(env, run.id)

    assert env.generation.get(run.id).status == "cancelled"
    assert len(env.fake.calls) < 6


@pytest.mark.parametrize(
    "kwargs",
    [
        {"subtype": "essay"},
        {"quantity": 0},
        {"quantity": 61},
        {"page_from": 0},
        {"page_from": 5, "page_to": 2},
    ],
)
async def test_invalid_requests_are_rejected_before_any_work(
    env: Env, kwargs: dict[str, object]
) -> None:
    material_id = await env.import_material()
    request = GenerationRequest(material_id, **{"subtype": "qa", **kwargs})  # type: ignore[arg-type]
    with pytest.raises(ValidationFailed):
        env.generation.start(request)
    assert env.generation.list_runs() == []
    assert env.fake.calls == []


async def test_unknown_unindexed_or_empty_selections_are_rejected(env: Env) -> None:
    with pytest.raises(MaterialNotFound):
        env.generation.start(GenerationRequest(99, "qa"))
    material_id = await env.import_material()
    with pytest.raises(ValidationFailed, match="Não há texto"):
        env.generation.start(GenerationRequest(material_id, "qa", page_from=50))
    slow = env.materials.import_file("b.md", io.BytesIO(b"# x\n\ntext"))
    with pytest.raises(ValidationFailed, match="indexado"):
        env.generation.start(GenerationRequest(slow.id, "qa"))
    await env.queue.wait(env.workspace.info.id, slow.job_id or 0)


async def test_readiness_errors_surface_before_creating_a_run(env: Env, tmp_path: Path) -> None:
    material_id = await env.import_material()
    env.fake.requires_consent = True
    with pytest.raises(ProviderKeyMissing):
        env.generation.start(GenerationRequest(material_id, "qa"))
    env.services.secrets.save_api_key("sk-or-v1-test")
    with pytest.raises(ConsentRequired):
        env.generation.start(GenerationRequest(material_id, "qa"))
    env.services.consent.give("openrouter")
    env.fake.requires_consent = False
    env.services.settings.update(monthly_limit_usd=1.0)
    env.services.ledger.record("openrouter", "m", "generation", Usage(cost_usd=1.5))
    with pytest.raises(MonthlyLimitReached):
        env.generation.start(GenerationRequest(material_id, "qa"))
    assert env.generation.list_runs() == []


async def test_estimate_uses_the_cached_price_and_reports_the_plan(env: Env) -> None:
    material_id = await env.import_material()
    request = GenerationRequest(material_id, "qa", quantity=20)
    unknown = env.generation.estimate(request)
    assert unknown.estimated_usd is None
    assert unknown.batches >= 1
    assert unknown.chunks >= unknown.batches

    model = env.services.settings.get().generation_model
    with env.registry.app_sessions() as session:
        session.add(
            ModelPrice(model=model, prompt_usd_per_token=1e-6, completion_usd_per_token=2e-6)
        )
        session.commit()
    priced = env.generation.estimate(request)
    assert priced.estimated_usd is not None
    assert priced.estimated_usd == pytest.approx(
        (priced.prompt_chars / 4) * 1e-6 + 20 * 150 * 2e-6, rel=0.01
    )
    assert env.fake.calls == []


async def test_unknown_run_is_not_found(env: Env) -> None:
    with pytest.raises(GenerationRunNotFound):
        env.generation.get(404)
