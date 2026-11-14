# Filename: rendering.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Template rendering helpers shared by the HTML routes."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from mind.ingestion.service import MaterialsFactory
from mind.services import Services
from mind.web.math import render_math
from mind.web.strings import APP_NAME, SECTIONS, T
from mind.workspaces.registry import WorkspaceInfo, WorkspaceRegistry

BASE_DIR = Path(__file__).parent

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
templates.env.filters["math"] = render_math


def get_registry(request: Request) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = request.app.state.registry
    return registry


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


def get_materials(request: Request) -> MaterialsFactory:
    factory: MaterialsFactory = request.app.state.materials
    return factory


Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]
ServicesDep = Annotated[Services, Depends(get_services)]
MaterialsDep = Annotated[MaterialsFactory, Depends(get_materials)]


def render(
    request: Request,
    template: str,
    *,
    status_code: int = 200,
    workspace: WorkspaceInfo | None = None,
    **context: Any,
) -> HTMLResponse:
    registry: WorkspaceRegistry = request.app.state.registry
    services: Services = request.app.state.services
    base: dict[str, Any] = {
        "t": T,
        "app_name": APP_NAME,
        "sections": SECTIONS,
        "workspace": workspace,
        "workspaces": registry.list(),
        "needs_setup": services.needs_setup(),
    }
    return templates.TemplateResponse(
        request, template, {**base, **context}, status_code=status_code
    )
