# Filename: deps.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Dependencies shared by the API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from mind.chat.factory import ChatFactory
from mind.error_notebook.service import NotebookFactory
from mind.generation.service import GenerationFactory
from mind.ingestion.service import MaterialsFactory
from mind.jobs.queue import JobQueue
from mind.practice.service import PracticeFactory
from mind.review.service import ReviewFactory
from mind.services import Services
from mind.stats.service import StatsFactory
from mind.study.service import StudyFactory
from mind.workspaces.registry import WorkspaceRegistry


def get_registry(request: Request) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = request.app.state.registry
    return registry


def get_queue(request: Request) -> JobQueue:
    queue: JobQueue = request.app.state.queue
    return queue


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


def get_study(request: Request) -> StudyFactory:
    factory: StudyFactory = request.app.state.study
    return factory


def get_practice(request: Request) -> PracticeFactory:
    factory: PracticeFactory = request.app.state.practice
    return factory


def get_stats(request: Request) -> StatsFactory:
    factory: StatsFactory = request.app.state.stats
    return factory


def get_chat(request: Request) -> ChatFactory:
    factory: ChatFactory = request.app.state.chat
    return factory


def get_notebook(request: Request) -> NotebookFactory:
    factory: NotebookFactory = request.app.state.notebook
    return factory


ServicesDep = Annotated[Services, Depends(get_services)]
StatsDep = Annotated[StatsFactory, Depends(get_stats)]
NotebookDep = Annotated[NotebookFactory, Depends(get_notebook)]
ChatDep = Annotated[ChatFactory, Depends(get_chat)]
PracticeDep = Annotated[PracticeFactory, Depends(get_practice)]
StudyDep = Annotated[StudyFactory, Depends(get_study)]
GenerationDep = Annotated[GenerationFactory, Depends(get_generation)]
ReviewDep = Annotated[ReviewFactory, Depends(get_review)]
MaterialsDep = Annotated[MaterialsFactory, Depends(get_materials)]
Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]
Queue = Annotated[JobQueue, Depends(get_queue)]
