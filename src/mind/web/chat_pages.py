# Filename: chat_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages of the chat with the knowledge base and its optional semantic search."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.errors import AppError
from mind.web.rendering import ChatDep, Registry, render

router = APIRouter(prefix="/w/{workspace_id}/chat")


def _context(workspace_id: int, chat: ChatDep) -> dict[str, Any]:
    return {
        "active": "chat",
        "workspace_id": workspace_id,
        "messages": chat.for_workspace(workspace_id).history(),
        "embeddings": chat.embeddings(workspace_id).status(),
    }


@router.get("", response_class=HTMLResponse)
async def chat_page(
    request: Request, workspace_id: int, registry: Registry, chat: ChatDep
) -> HTMLResponse:
    info = registry.get(workspace_id)
    return render(request, "chat.html", workspace=info, **_context(workspace_id, chat))


@router.post("", response_model=None)
async def ask(
    request: Request,
    workspace_id: int,
    registry: Registry,
    chat: ChatDep,
    question: Annotated[str, Form()] = "",
) -> Response:
    info = registry.get(workspace_id)
    try:
        await chat.for_workspace(workspace_id).ask(question)
    except AppError as exc:
        return render(
            request,
            "chat.html",
            status_code=exc.status,
            workspace=info,
            form_error=exc.detail or exc.title,
            form_question=question,
            **_context(workspace_id, chat),
        )
    return RedirectResponse(f"/w/{workspace_id}/chat", status_code=303)


@router.post("/clear", response_model=None)
async def clear(workspace_id: int, registry: Registry, chat: ChatDep) -> Response:
    registry.get(workspace_id)
    chat.for_workspace(workspace_id).clear()
    return RedirectResponse(f"/w/{workspace_id}/chat", status_code=303)


@router.post("/embeddings/enable", response_model=None)
async def enable_embeddings(
    request: Request, workspace_id: int, registry: Registry, chat: ChatDep
) -> Response:
    info = registry.get(workspace_id)
    try:
        chat.embeddings(workspace_id).enable()
    except AppError as exc:
        return render(
            request,
            "chat.html",
            status_code=exc.status,
            workspace=info,
            form_error=exc.detail or exc.title,
            **_context(workspace_id, chat),
        )
    return RedirectResponse(f"/w/{workspace_id}/chat", status_code=303)


@router.post("/embeddings/disable", response_model=None)
async def disable_embeddings(workspace_id: int, registry: Registry, chat: ChatDep) -> Response:
    registry.get(workspace_id)
    chat.embeddings(workspace_id).disable()
    return RedirectResponse(f"/w/{workspace_id}/chat", status_code=303)
