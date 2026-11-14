# Filename: items.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Item resources of the v1 API: list, edit, approve and discard generated items."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from mind.api.deps import Registry, ReviewDep
from mind.api.schemas import ItemEdit, ItemOut, Problem, ReviewIn, ReviewOut
from mind.review.service import ItemInfo

router = APIRouter(prefix="/workspaces/{workspace_id}/items", tags=["items"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or item not found."},
    422: {"model": Problem, "description": "Invalid text for this card type."},
}


def to_out(info: ItemInfo) -> ItemOut:
    return ItemOut(**info.__dict__)


@router.get("", response_model=list[ItemOut], responses=ERRORS, summary="List items")
async def list_items(
    workspace_id: int,
    review: ReviewDep,
    registry: Registry,
    status: Annotated[str | None, Query(pattern="^(draft|approved|discarded)$")] = None,
    run_id: int | None = None,
    kind: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ItemOut]:
    registry.get(workspace_id)
    service = review.for_workspace(workspace_id)
    items = service.list_items(run_id=run_id, status=status, kind=kind, limit=limit, offset=offset)
    return [to_out(item) for item in items]


@router.post(
    "/review",
    response_model=ReviewOut,
    responses=ERRORS,
    summary="Approve and discard drafts in bulk",
)
async def review_items(
    workspace_id: int, body: ReviewIn, review: ReviewDep, registry: Registry
) -> ReviewOut:
    registry.get(workspace_id)
    result = review.for_workspace(workspace_id).review(approve=body.approve, discard=body.discard)
    return ReviewOut(**result.__dict__)


@router.get("/{item_id}", response_model=ItemOut, responses=ERRORS, summary="Get an item")
async def get_item(
    workspace_id: int, item_id: int, review: ReviewDep, registry: Registry
) -> ItemOut:
    registry.get(workspace_id)
    return to_out(review.for_workspace(workspace_id).get(item_id))


@router.patch(
    "/{item_id}", response_model=ItemOut, responses=ERRORS, summary="Edit an item's text and topic"
)
async def edit_item(
    workspace_id: int, item_id: int, body: ItemEdit, review: ReviewDep, registry: Registry
) -> ItemOut:
    registry.get(workspace_id)
    service = review.for_workspace(workspace_id)
    return to_out(service.edit(item_id, body.front, body.back, body.topic))
