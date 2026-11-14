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

from mind.error_notebook.service import NotebookFactory
from mind.generation.service import GenerationFactory
from mind.ingestion.service import MaterialsFactory
from mind.practice.service import PracticeFactory
from mind.review.service import ReviewFactory
from mind.services import Services
from mind.stats.service import StatsFactory
from mind.study.service import StudyFactory
from mind.web.formatting import br_datetime, br_day, percent
from mind.web.math import cloze_plain, render_math
from mind.web.strings import APP_NAME, SECTIONS, T
from mind.workspaces.registry import WorkspaceInfo, WorkspaceRegistry

BASE_DIR = Path(__file__).parent

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
templates.env.filters["math"] = render_math
templates.env.filters["cloze"] = cloze_plain
templates.env.filters["pct"] = percent
templates.env.filters["br_datetime"] = br_datetime
templates.env.filters["br_day"] = br_day


def get_registry(request: Request) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = request.app.state.registry
    return registry


def get_services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


def get_materials(request: Request) -> MaterialsFactory:
    factory: MaterialsFactory = request.app.state.materials
    return factory


def get_generation(request: Request) -> GenerationFactory:
    factory: GenerationFactory = request.app.state.generation
    return factory


def get_review(request: Request) -> ReviewFactory:
    factory: ReviewFactory = request.app.state.review
    return factory


def get_stats(request: Request) -> StatsFactory:
    factory: StatsFactory = request.app.state.stats
    return factory


def get_notebook(request: Request) -> NotebookFactory:
    factory: NotebookFactory = request.app.state.notebook
    return factory


def get_practice(request: Request) -> PracticeFactory:
    factory: PracticeFactory = request.app.state.practice
    return factory


def get_study(request: Request) -> StudyFactory:
    factory: StudyFactory = request.app.state.study
    return factory


Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]
ServicesDep = Annotated[Services, Depends(get_services)]
MaterialsDep = Annotated[MaterialsFactory, Depends(get_materials)]
GenerationDep = Annotated[GenerationFactory, Depends(get_generation)]
ReviewDep = Annotated[ReviewFactory, Depends(get_review)]
StudyDep = Annotated[StudyFactory, Depends(get_study)]
PracticeDep = Annotated[PracticeFactory, Depends(get_practice)]
StatsDep = Annotated[StatsFactory, Depends(get_stats)]
NotebookDep = Annotated[NotebookFactory, Depends(get_notebook)]


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
