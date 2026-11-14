# Filename: app.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""FastAPI application: the MIND HTML shell (Jinja + HTMX)."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from mind.config import Settings, load_settings
from mind.errors import AppError, ValidationFailed, WorkspaceNotFound
from mind.jobs.queue import JobQueue
from mind.web.math import render_math
from mind.web.strings import APP_NAME, SECTIONS, T
from mind.workspaces.registry import WorkspaceInfo, WorkspaceRegistry

BASE_DIR = Path(__file__).parent
CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
    "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
    "frame-ancestors 'none'"
)

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
templates.env.filters["math"] = render_math


def get_registry(request: Request) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = request.app.state.registry
    return registry


Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]


def render(
    request: Request,
    template: str,
    *,
    status_code: int = 200,
    workspace: WorkspaceInfo | None = None,
    registry: WorkspaceRegistry | None = None,
    **context: Any,
) -> HTMLResponse:
    base: dict[str, Any] = {
        "t": T,
        "app_name": APP_NAME,
        "sections": SECTIONS,
        "workspace": workspace,
        "workspaces": registry.list() if registry is not None else [],
    }
    return templates.TemplateResponse(
        request, template, {**base, **context}, status_code=status_code
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or load_settings(env_file=Path(".env"))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        registry = WorkspaceRegistry(resolved)
        queue = JobQueue(resolved.max_concurrent_jobs)
        app.state.settings = resolved
        app.state.registry = registry
        app.state.queue = queue
        try:
            yield
        finally:
            await queue.shutdown()
            registry.close()

    app = FastAPI(
        title=APP_NAME,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> HTMLResponse:
        registry: WorkspaceRegistry = request.app.state.registry
        return render(
            request,
            "error.html",
            status_code=exc.status,
            registry=registry,
            error=exc,
        )

    @app.get("/", response_model=None)
    async def index(registry: Registry) -> RedirectResponse:
        workspaces = registry.list()
        if not workspaces:
            return RedirectResponse("/welcome", status_code=303)
        return RedirectResponse(f"/w/{workspaces[0].id}/today", status_code=303)

    @app.get("/welcome", response_class=HTMLResponse)
    async def welcome(request: Request, registry: Registry) -> HTMLResponse:
        return render(request, "welcome.html", registry=registry)

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
                registry=registry,
                form_error=exc.detail,
                form_name=name,
            )
        return RedirectResponse(f"/w/{info.id}/today", status_code=303)

    def current(registry: WorkspaceRegistry, workspace_id: int) -> WorkspaceInfo:
        return registry.get(workspace_id)

    @app.get("/w/{workspace_id}/today", response_class=HTMLResponse)
    async def today(request: Request, workspace_id: int, registry: Registry) -> HTMLResponse:
        workspace = current(registry, workspace_id)
        return render(request, "today.html", workspace=workspace, registry=registry, active="today")

    @app.post("/w/{workspace_id}/rename", response_model=None)
    async def rename_workspace(
        request: Request,
        workspace_id: int,
        registry: Registry,
        name: Annotated[str, Form()] = "",
    ) -> Response:
        registry.rename(workspace_id, name)
        return RedirectResponse(f"/w/{workspace_id}/settings", status_code=303)

    @app.post("/w/{workspace_id}/delete", response_model=None)
    async def delete_workspace(
        request: Request,
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
        label = dict(SECTIONS)[section]
        return render(
            request,
            template,
            workspace=workspace,
            registry=registry,
            active=section,
            section_label=label,
        )

    return app
