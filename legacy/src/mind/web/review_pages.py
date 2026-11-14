# Filename: review_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages to review generated cards next to their source."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.errors import ValidationFailed
from mind.generation.service import GenerationService
from mind.review.service import ItemInfo, ReviewService
from mind.verification.source_checker import locate_quote
from mind.web.rendering import GenerationDep, Registry, ReviewDep, render

router = APIRouter(prefix="/w/{workspace_id}/review")

CONTEXT_CHARS = 300


@dataclass(frozen=True)
class SourceView:
    """The source text split around the highlighted quote."""

    before: str
    hit: str
    after: str
    truncated_before: bool
    truncated_after: bool


def source_view(review: ReviewService, item: ItemInfo) -> SourceView | None:
    text = review.source_text(item.chunk_id)
    if text is None:
        return None
    match = locate_quote(text, item.quote)
    if match is None:
        return SourceView("", "", text[: 2 * CONTEXT_CHARS], False, len(text) > 2 * CONTEXT_CHARS)
    start = max(match.start - CONTEXT_CHARS, 0)
    end = min(match.end + CONTEXT_CHARS, len(text))
    return SourceView(
        before=text[start : match.start],
        hit=text[match.start : match.end],
        after=text[match.end : end],
        truncated_before=start > 0,
        truncated_after=end < len(text),
    )


def _entries(review: ReviewService, items: list[ItemInfo]) -> list[dict[str, Any]]:
    return [{"item": item, "source": source_view(review, item)} for item in items]


def _pick_run(
    generation: GenerationService, review: ReviewService, run_id: int | None
) -> int | None:
    if run_id is not None:
        return run_id
    for run in generation.list_runs():
        if review.count(run_id=run.id, status="draft") > 0:
            return run.id
    runs = generation.list_runs(limit=1)
    return runs[0].id if runs else None


@router.get("", response_class=HTMLResponse)
async def review_page(
    request: Request,
    workspace_id: int,
    registry: Registry,
    generation: GenerationDep,
    review_factory: ReviewDep,
    run: int | None = None,
) -> HTMLResponse:
    info = registry.get(workspace_id)
    generations = generation.for_workspace(workspace_id)
    review = review_factory.for_workspace(workspace_id)
    run_id = _pick_run(generations, review, run)
    run_info = generations.get(run_id) if run_id is not None else None
    items = review.list_items(run_id=run_id, status="draft", limit=200) if run_id else []
    return render(
        request,
        "review.html",
        workspace=info,
        active="generate",
        run=run_info,
        entries=_entries(review, items),
        pending=review.count(run_id=run_id, status="draft") if run_id else 0,
        workspace_id=workspace_id,
    )


def _back(workspace_id: int, run_id: int | None) -> RedirectResponse:
    suffix = f"?run={run_id}" if run_id else ""
    return RedirectResponse(f"/w/{workspace_id}/review{suffix}", status_code=303)


@router.post("/approve", response_model=None)
async def approve(
    workspace_id: int,
    registry: Registry,
    review_factory: ReviewDep,
    item_ids: Annotated[list[int] | None, Form()] = None,
    run: Annotated[int | None, Form()] = None,
) -> Response:
    registry.get(workspace_id)
    review_factory.for_workspace(workspace_id).review(approve=item_ids or [])
    return _back(workspace_id, run)


@router.post("/approve-all", response_model=None)
async def approve_all(
    workspace_id: int,
    registry: Registry,
    review_factory: ReviewDep,
    run: Annotated[int, Form()],
) -> Response:
    registry.get(workspace_id)
    review_factory.for_workspace(workspace_id).approve_all(run)
    return _back(workspace_id, run)


@router.post("/discard", response_model=None)
async def discard(
    workspace_id: int,
    registry: Registry,
    review_factory: ReviewDep,
    item_ids: Annotated[list[int] | None, Form()] = None,
    run: Annotated[int | None, Form()] = None,
) -> Response:
    registry.get(workspace_id)
    review_factory.for_workspace(workspace_id).review(discard=item_ids or [])
    return _back(workspace_id, run)


@router.get("/items/{item_id}/edit", response_class=HTMLResponse)
async def edit_form(
    request: Request, workspace_id: int, item_id: int, registry: Registry, review_factory: ReviewDep
) -> HTMLResponse:
    registry.get(workspace_id)
    item = review_factory.for_workspace(workspace_id).get(item_id)
    return render(request, "_review_edit.html", item=item, workspace_id=workspace_id)


@router.get("/items/{item_id}", response_class=HTMLResponse)
async def item_card(
    request: Request, workspace_id: int, item_id: int, registry: Registry, review_factory: ReviewDep
) -> HTMLResponse:
    registry.get(workspace_id)
    review = review_factory.for_workspace(workspace_id)
    entry = _entries(review, [review.get(item_id)])[0]
    return render(request, "_review_item.html", entry=entry, workspace_id=workspace_id)


@router.post("/items/{item_id}", response_class=HTMLResponse)
async def save_edit(
    request: Request,
    workspace_id: int,
    item_id: int,
    registry: Registry,
    review_factory: ReviewDep,
    front: Annotated[str, Form()] = "",
    back: Annotated[str, Form()] = "",
    topic: Annotated[str, Form()] = "",
) -> HTMLResponse:
    registry.get(workspace_id)
    review = review_factory.for_workspace(workspace_id)
    try:
        review.edit(item_id, front, back, topic or None)
    except ValidationFailed as exc:
        item = review.get(item_id)
        return render(
            request,
            "_review_edit.html",
            item=item,
            workspace_id=workspace_id,
            form_error=exc.detail,
            draft_front=front,
            draft_back=back,
            draft_topic=topic,
        )
    entry = _entries(review, [review.get(item_id)])[0]
    return render(request, "_review_item.html", entry=entry, workspace_id=workspace_id)


@router.post("/items/{item_id}/discard", response_class=HTMLResponse)
async def discard_one(
    workspace_id: int, item_id: int, registry: Registry, review_factory: ReviewDep
) -> HTMLResponse:
    registry.get(workspace_id)
    review_factory.for_workspace(workspace_id).review(discard=[item_id])
    return HTMLResponse("")
