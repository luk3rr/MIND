# Filename: deps.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Dependencies shared by the API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from mind.jobs.queue import JobQueue
from mind.services import Services
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


ServicesDep = Annotated[Services, Depends(get_services)]
Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]
Queue = Annotated[JobQueue, Depends(get_queue)]
