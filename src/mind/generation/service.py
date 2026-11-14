# Filename: service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Generation runs: validate a request, estimate its cost, run it as a job, report on it."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.workspace_models import GenerationRun, Material
from mind.errors import (
    AppError,
    FieldError,
    GenerationRunNotFound,
    MaterialNotFound,
    ValidationFailed,
)
from mind.generation.cards import BatchOutcome, CardGenerator
from mind.generation.planning import SourceChunk, plan_batches, select_chunks
from mind.generation.prompts import SUBTYPE_RULES, SYSTEM
from mind.generation.schemas import CARD_SUBTYPES
from mind.jobs.queue import JobCancelled, JobContext, JobQueue, JobWork
from mind.services import Services
from mind.workspaces.registry import OpenWorkspace, WorkspaceRegistry

MIN_QUANTITY = 1
MAX_QUANTITY = 60
OUTPUT_TOKENS_PER_CARD = 150
PROMPT_OVERHEAD_CHARS = 400
CONCURRENT_BATCHES = 2


@dataclass(frozen=True)
class GenerationRequest:
    material_id: int
    subtype: str
    quantity: int = 20
    page_from: int | None = None
    page_to: int | None = None


@dataclass(frozen=True)
class EstimateInfo:
    estimated_usd: float | None
    chunks: int
    batches: int
    prompt_chars: int


@dataclass(frozen=True)
class RunInfo:
    id: int
    kind: str
    subtype: str
    material_id: int | None
    page_from: int | None
    page_to: int | None
    model: str
    requested: int
    generated: int
    discarded_no_source: int
    discarded_invalid: int
    discarded_duplicate: int
    approved: int
    approved_unedited: int
    discarded_review: int
    cost_usd: float
    status: str
    discard_log: list[dict[str, str]]
    error_code: str | None
    error_detail: str | None
    job_id: int | None
    created_at: datetime
    finished_at: datetime | None


def _info(row: GenerationRun) -> RunInfo:
    return RunInfo(
        id=row.id,
        kind=row.kind,
        subtype=row.subtype,
        material_id=row.material_id,
        page_from=row.page_from,
        page_to=row.page_to,
        model=row.model,
        requested=row.requested,
        generated=row.generated,
        discarded_no_source=row.discarded_no_source,
        discarded_invalid=row.discarded_invalid,
        discarded_duplicate=row.discarded_duplicate,
        approved=row.approved,
        approved_unedited=row.approved_unedited,
        discarded_review=row.discarded_review,
        cost_usd=row.cost_usd,
        status=row.status,
        discard_log=json.loads(row.discard_log),
        error_code=row.error_code,
        error_detail=row.error_detail,
        job_id=row.job_id,
        created_at=row.created_at,
        finished_at=row.finished_at,
    )


def validate_request(request: GenerationRequest) -> None:
    errors: list[FieldError] = []
    if request.subtype not in CARD_SUBTYPES:
        errors.append(FieldError("subtype", "Tipo de card desconhecido."))
    if not MIN_QUANTITY <= request.quantity <= MAX_QUANTITY:
        errors.append(FieldError("quantity", f"Peça de {MIN_QUANTITY} a {MAX_QUANTITY} cards."))
    if request.page_from is not None and request.page_from < 1:
        errors.append(FieldError("page_from", "A primeira página é 1."))
    if (
        request.page_from is not None
        and request.page_to is not None
        and request.page_to < request.page_from
    ):
        errors.append(FieldError("page_to", "A página final vem antes da inicial."))
    if errors:
        raise ValidationFailed("Pedido de geração inválido.", errors=errors)


class GenerationService:
    def __init__(
        self,
        workspace: OpenWorkspace,
        queue: JobQueue,
        services: Services,
        *,
        concurrency: int = CONCURRENT_BATCHES,
    ) -> None:
        self._workspace = workspace
        self._queue = queue
        self._services = services
        self._concurrency = concurrency
        self._generator = CardGenerator(workspace.sessions, services.provider)

    @property
    def _sessions(self) -> sessionmaker[Session]:
        return self._workspace.sessions

    def _chunks_for(self, request: GenerationRequest) -> list[SourceChunk]:
        with self._sessions() as session:
            material = session.get(Material, request.material_id)
            if material is None:
                raise MaterialNotFound(f"Não existe material com id {request.material_id}.")
            if material.status != "indexed":
                raise ValidationFailed(
                    "O material ainda não foi indexado.",
                    errors=[FieldError("material_id", "Aguarde a importação terminar.")],
                )
        chunks = select_chunks(
            self._sessions, request.material_id, request.page_from, request.page_to
        )
        if not chunks:
            raise ValidationFailed(
                "Não há texto nesse recorte do material.",
                errors=[FieldError("page_from", "Escolha outro intervalo de páginas.")],
            )
        return chunks

    def estimate(self, request: GenerationRequest) -> EstimateInfo:
        validate_request(request)
        plan = plan_batches(self._chunks_for(request), request.quantity)
        prompt_chars = sum(
            len(SYSTEM)
            + len(SUBTYPE_RULES[request.subtype])
            + PROMPT_OVERHEAD_CHARS
            + sum(len(c.text) for c in batch.chunks)
            for batch in plan
        )
        model = self._services.settings.get().generation_model
        estimated = self._services.catalog.estimate(
            model, prompt_chars, request.quantity * OUTPUT_TOKENS_PER_CARD
        )
        return EstimateInfo(
            estimated_usd=estimated,
            chunks=sum(len(b.chunks) for b in plan),
            batches=len(plan),
            prompt_chars=prompt_chars,
        )

    def start(self, request: GenerationRequest) -> RunInfo:
        """Validate, create the run and queue the job. Must run inside the event loop."""
        validate_request(request)
        self._chunks_for(request)
        self._services.ensure_ready()
        model = self._services.settings.get().generation_model
        with self._sessions() as session:
            row = GenerationRun(
                kind="card",
                subtype=request.subtype,
                material_id=request.material_id,
                page_from=request.page_from,
                page_to=request.page_to,
                model=model,
                requested=request.quantity,
                status="queued",
            )
            session.add(row)
            session.commit()
            run_id = row.id
        job = self._queue.submit(
            self._workspace.info.id,
            self._sessions,
            "generate_cards",
            self._make_work(run_id, request, model),
        )
        with self._sessions() as session:
            queued = session.get(GenerationRun, run_id)
            if queued is not None:
                queued.job_id = job.id
                session.commit()
        return self.get(run_id)

    def _make_work(self, run_id: int, request: GenerationRequest, model: str) -> JobWork:
        async def work(ctx: JobContext) -> None:
            await self._run(run_id, request, model, ctx)

        return work

    async def _run(
        self, run_id: int, request: GenerationRequest, model: str, ctx: JobContext
    ) -> None:
        self._set_status(run_id, "running")
        plan = plan_batches(self._chunks_for(request), request.quantity)
        semaphore = asyncio.Semaphore(self._concurrency)
        accepted = 0
        finished = 0

        def remaining() -> int:
            return request.quantity - accepted

        async def run_batch(chunks: list[SourceChunk], count: int) -> None:
            nonlocal accepted, finished
            async with semaphore:
                ctx.check_cancelled()
                outcome = await self._generator.generate_batch(
                    run_id=run_id,
                    subtype=request.subtype,
                    count=count,
                    chunks=chunks,
                    model=model,
                    remaining=remaining,
                )
                accepted += outcome.accepted
                finished += 1
                self._add_outcome(run_id, outcome)
                ctx.update(finished / len(plan), f"lote {finished} de {len(plan)}")

        results = await asyncio.gather(
            *(run_batch(b.chunks, b.count) for b in plan),
            return_exceptions=True,
        )
        failure = next((r for r in results if isinstance(r, BaseException)), None)
        if failure is None:
            self._finish(run_id, "done")
            return
        if isinstance(failure, JobCancelled):
            self._finish(run_id, "cancelled")
        elif isinstance(failure, AppError):
            self._finish(run_id, "partial", failure.code, failure.detail)
        else:
            self._finish(run_id, "partial", "INTERNAL_ERROR", str(failure))
        raise failure

    def _set_status(self, run_id: int, status: str) -> None:
        with self._sessions() as session:
            row = session.get(GenerationRun, run_id)
            if row is not None:
                row.status = status
                session.commit()

    def _finish(
        self,
        run_id: int,
        status: str,
        error_code: str | None = None,
        error_detail: str | None = None,
    ) -> None:
        with self._sessions() as session:
            row = session.get(GenerationRun, run_id)
            if row is not None:
                row.status = status
                row.error_code, row.error_detail = error_code, error_detail
                row.finished_at = utcnow()
                session.commit()

    def _add_outcome(self, run_id: int, outcome: BatchOutcome) -> None:
        with self._sessions() as session:
            row = session.get(GenerationRun, run_id)
            if row is None:
                return
            row.generated += outcome.accepted
            row.discarded_no_source += outcome.no_source
            row.discarded_invalid += outcome.invalid
            row.discarded_duplicate += outcome.duplicate
            row.cost_usd += outcome.cost_usd
            log: list[Any] = json.loads(row.discard_log)
            room = 20 - len(log)
            if room > 0:
                log.extend(outcome.log[:room])
                row.discard_log = json.dumps(log, ensure_ascii=False)
            session.commit()

    def get(self, run_id: int) -> RunInfo:
        with self._sessions() as session:
            row = session.get(GenerationRun, run_id)
            if row is None:
                raise GenerationRunNotFound(f"Não existe geração com id {run_id}.")
            return _info(row)

    def list_runs(self, *, limit: int = 20) -> list[RunInfo]:
        with self._sessions() as session:
            rows = session.scalars(
                select(GenerationRun).order_by(GenerationRun.id.desc()).limit(limit)
            ).all()
            return [_info(row) for row in rows]


class GenerationFactory:
    """Builds the `GenerationService` of a workspace on demand."""

    def __init__(self, registry: WorkspaceRegistry, queue: JobQueue, services: Services) -> None:
        self._registry = registry
        self._queue = queue
        self._services = services

    def for_workspace(self, workspace_id: int) -> GenerationService:
        return GenerationService(self._registry.open(workspace_id), self._queue, self._services)
