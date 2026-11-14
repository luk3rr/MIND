# Filename: deps.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Dependencies shared by the API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from mind.jobs.queue import JobQueue
from mind.workspaces.registry import WorkspaceRegistry


def get_registry(request: Request) -> WorkspaceRegistry:
    registry: WorkspaceRegistry = request.app.state.registry
    return registry


def get_queue(request: Request) -> JobQueue:
    queue: JobQueue = request.app.state.queue
    return queue


Registry = Annotated[WorkspaceRegistry, Depends(get_registry)]
Queue = Annotated[JobQueue, Depends(get_queue)]
