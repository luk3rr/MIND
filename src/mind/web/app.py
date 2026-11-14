# Filename: app.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""FastAPI application: the MIND HTML shell (Jinja + HTMX)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

from mind.api.app import create_api_app
from mind.chat.factory import ChatFactory
from mind.config import Settings, load_settings
from mind.error_notebook.service import NotebookFactory
from mind.errors import AppError, ValidationFailed, WorkspaceNotFound
from mind.generation.service import GenerationFactory
from mind.ingestion.service import MaterialsFactory
from mind.ingestion.web import PageFetcher
from mind.jobs.queue import JobQueue
from mind.llm.provider import Provider
from mind.practice.service import PracticeFactory
from mind.redaction import install_log_redaction, uninstall_log_redaction
from mind.retrieval.embeddings import Embedder
from mind.review.service import ReviewFactory
from mind.services import Services
from mind.stats.service import StatsFactory
from mind.study.service import StudyFactory
from mind.web.chat_pages import router as chat_router
from mind.web.errors_pages import router as errors_router
from mind.web.generate_pages import router as generate_router
from mind.web.library_pages import router as library_router
from mind.web.practice_pages import router as practice_router
from mind.web.provider_pages import router as provider_router
from mind.web.rendering import (
    BASE_DIR,
    MaterialsDep,
    PracticeDep,
    Registry,
    ReviewDep,
    StatsDep,
    StudyDep,
    render,
)
from mind.web.review_pages import router as review_router
from mind.web.security import install_security
from mind.web.stats_pages import router as stats_router
from mind.web.strings import SECTIONS
from mind.web.study_pages import router as study_router
from mind.workspaces.archive import download_name, export_to_temp, import_upload
from mind.workspaces.registry import WorkspaceInfo, WorkspaceRegistry


def create_app(
    settings: Settings | None = None,
    *,
    http_client: httpx.AsyncClient | None = None,
    inner_provider: Provider | None = None,
    page_fetcher: PageFetcher | None = None,
    embedder: Embedder | None = None,
) -> FastAPI:
    """Build the application. The optional arguments let tests replace the network layer."""
    resolved = settings or load_settings(env_file=Path(".env"))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        registry = WorkspaceRegistry(resolved)
        queue = JobQueue(resolved.max_concurrent_jobs)
        services = Services.build(
            resolved, registry, client=http_client, inner_provider=inner_provider
        )
        uninstall_log_redaction()
        install_log_redaction(services.secrets)
        for target in (app, api_app):
            target.state.settings = resolved
            target.state.registry = registry
            target.state.queue = queue
            target.state.services = services
            target.state.materials = MaterialsFactory(registry, queue, resolved, page_fetcher)
            target.state.generation = GenerationFactory(registry, queue, services)
            target.state.review = ReviewFactory(registry)
            target.state.study = StudyFactory(registry)
            target.state.practice = PracticeFactory(registry)
            target.state.stats = StatsFactory(registry)
            target.state.notebook = NotebookFactory(registry)
            target.state.chat = ChatFactory(registry, queue, services, embedder)
        try:
            yield
        finally:
            await queue.shutdown()
            await services.aclose()
            uninstall_log_redaction()
            registry.close()

    app = FastAPI(
        title="MIND",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    api_app = create_api_app()
    app.mount("/api", api_app)
    app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
    install_security(app, resolved)
    app.include_router(provider_router)
    app.include_router(library_router)
    app.include_router(generate_router)
    app.include_router(review_router)
    app.include_router(study_router)
    app.include_router(practice_router)
    app.include_router(stats_router)
    app.include_router(errors_router)
    app.include_router(chat_router)

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> HTMLResponse:
        return render(request, "error.html", status_code=exc.status, error=exc)

    @app.get("/", response_model=None)
    async def index(registry: Registry) -> RedirectResponse:
        workspaces = registry.list()
        if not workspaces:
            return RedirectResponse("/welcome", status_code=303)
        return RedirectResponse(f"/w/{workspaces[0].id}/today", status_code=303)

    @app.get("/welcome", response_class=HTMLResponse)
    async def welcome(request: Request) -> HTMLResponse:
        return render(request, "welcome.html")

    @app.post("/workspaces", response_model=None)
    async def create_workspace(
        request: Request, registry: Registry, name: Annotated[str, Form()] = ""
    ) -> Response:
        try:
            info = registry.create(name)
        except ValidationFailed as exc:
            return render(
                request,
                "welcome.html",
                status_code=exc.status,
                form_error=exc.detail,
                form_name=name,
            )
        return RedirectResponse(f"/w/{info.id}/today", status_code=303)

    def current(registry: WorkspaceRegistry, workspace_id: int) -> WorkspaceInfo:
        return registry.get(workspace_id)

    @app.get("/w/{workspace_id}/today", response_class=HTMLResponse)
    async def today(
        request: Request,
        workspace_id: int,
        registry: Registry,
        study: StudyDep,
        materials: MaterialsDep,
        review: ReviewDep,
        practice: PracticeDep,
        stats: StatsDep,
    ) -> HTMLResponse:
        workspace = current(registry, workspace_id)
        study_service = study.for_workspace(workspace_id)
        counts = study_service.counts()
        goal = study_service.settings().daily_goal
        return render(
            request,
            "today.html",
            workspace=workspace,
            active="today",
            counts=counts,
            goal=goal,
            goal_met=counts.reviewed_today >= goal,
            questions=practice.for_workspace(workspace_id).counts(),
            weak_topics=stats.stats(workspace_id).weakest_topics(3),
            has_materials=bool(materials.for_workspace(workspace_id).list_materials()),
            approved_cards=review.for_workspace(workspace_id).count(status="approved", kind="card"),
        )

    @app.get("/w/{workspace_id}/export", response_model=None)
    async def export_workspace_backup(workspace_id: int, registry: Registry) -> Response:
        info = current(registry, workspace_id)
        path = await asyncio.to_thread(export_to_temp, registry, workspace_id)
        return FileResponse(
            path,
            media_type="application/zip",
            filename=download_name(info),
            background=BackgroundTask(path.unlink, missing_ok=True),
        )

    @app.post("/workspaces/import", response_model=None)
    async def import_workspace_backup(
        registry: Registry, file: Annotated[UploadFile, File()]
    ) -> Response:
        info = await asyncio.to_thread(import_upload, registry, file.file)
        return RedirectResponse(f"/w/{info.id}/today", status_code=303)

    @app.post("/w/{workspace_id}/rename", response_model=None)
    async def rename_workspace(
        workspace_id: int,
        registry: Registry,
        name: Annotated[str, Form()] = "",
    ) -> Response:
        registry.rename(workspace_id, name)
        return RedirectResponse(f"/w/{workspace_id}/settings", status_code=303)

    @app.post("/w/{workspace_id}/delete", response_model=None)
    async def delete_workspace(
        workspace_id: int,
        registry: Registry,
        confirm: Annotated[str, Form()] = "",
    ) -> Response:
        workspace = current(registry, workspace_id)
        if confirm.strip() != workspace.name:
            raise ValidationFailed("O nome digitado não confere; nada foi excluído.")
        registry.delete(workspace_id)
        return RedirectResponse("/", status_code=303)

    @app.get("/w/{workspace_id}/{section}", response_class=HTMLResponse)
    async def section_page(
        request: Request, workspace_id: int, section: str, registry: Registry
    ) -> HTMLResponse:
        slugs = {slug for slug, _ in SECTIONS}
        if section not in slugs:
            raise WorkspaceNotFound("Página não encontrada.")
        workspace = current(registry, workspace_id)
        template = "settings.html" if section == "settings" else "coming_soon.html"
        return render(
            request,
            template,
            workspace=workspace,
            active=section,
            section_label=dict(SECTIONS)[section],
        )

    return app
