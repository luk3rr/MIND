# Filename: chat.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Chat with the knowledge base and its optional semantic search."""

from __future__ import annotations

from fastapi import APIRouter, Response

from mind.api.deps import ChatDep, Registry
from mind.api.schemas import (
    ChatAskIn,
    ChatCitationOut,
    ChatMessageOut,
    EmbeddingsEnableOut,
    EmbeddingsStatusOut,
    Problem,
)
from mind.chat.service import ChatReply
from mind.retrieval.embeddings import EmbeddingStatus

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["chat"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace not found."}
}
NOT_READY: dict[int | str, dict[str, object]] = {
    409: {"model": Problem, "description": "No API key or consent."},
    402: {"model": Problem, "description": "Monthly cost limit reached."},
}


def to_out(reply: ChatReply) -> ChatMessageOut:
    return ChatMessageOut(
        id=reply.id,
        question=reply.question,
        answer=reply.answer,
        supported=reply.supported,
        citations=[ChatCitationOut(**c.__dict__) for c in reply.citations],
        cost_usd=reply.cost_usd,
        created_at=reply.created_at,
    )


def status_out(status: EmbeddingStatus) -> EmbeddingsStatusOut:
    return EmbeddingsStatusOut(**status.__dict__)


@router.post(
    "/chat",
    response_model=ChatMessageOut,
    responses={**ERRORS, **NOT_READY, 422: {"model": Problem, "description": "Invalid question."}},
    summary="Ask a question about the material (answers cite their sources or refuse)",
)
async def ask(
    workspace_id: int, body: ChatAskIn, chat: ChatDep, registry: Registry
) -> ChatMessageOut:
    registry.get(workspace_id)
    return to_out(await chat.for_workspace(workspace_id).ask(body.question))


@router.get(
    "/chat/messages",
    response_model=list[ChatMessageOut],
    responses=ERRORS,
    summary="Latest chat messages, oldest first",
)
async def messages(workspace_id: int, chat: ChatDep, registry: Registry) -> list[ChatMessageOut]:
    registry.get(workspace_id)
    return [to_out(m) for m in chat.for_workspace(workspace_id).history()]


@router.delete(
    "/chat/messages", status_code=204, responses=ERRORS, summary="Delete the chat history"
)
async def clear(workspace_id: int, chat: ChatDep, registry: Registry) -> Response:
    registry.get(workspace_id)
    chat.for_workspace(workspace_id).clear()
    return Response(status_code=204)


@router.get(
    "/embeddings/status",
    response_model=EmbeddingsStatusOut,
    responses=ERRORS,
    summary="State of the optional semantic search",
)
async def embeddings_status(
    workspace_id: int, chat: ChatDep, registry: Registry
) -> EmbeddingsStatusOut:
    registry.get(workspace_id)
    return status_out(chat.embeddings(workspace_id).status())


@router.post(
    "/embeddings/enable",
    response_model=EmbeddingsEnableOut,
    status_code=202,
    responses={**ERRORS, 409: {"model": Problem, "description": "The extra is not installed."}},
    summary="Turn the semantic search on and vectorize the chunks that still lack a vector",
)
async def enable_embeddings(
    workspace_id: int, chat: ChatDep, registry: Registry
) -> EmbeddingsEnableOut:
    registry.get(workspace_id)
    return EmbeddingsEnableOut(job_id=chat.embeddings(workspace_id).enable())


@router.post(
    "/embeddings/disable",
    response_model=EmbeddingsStatusOut,
    responses=ERRORS,
    summary="Turn the semantic search off (vectors are kept)",
)
async def disable_embeddings(
    workspace_id: int, chat: ChatDep, registry: Registry
) -> EmbeddingsStatusOut:
    registry.get(workspace_id)
    service = chat.embeddings(workspace_id)
    service.disable()
    return status_out(service.status())
