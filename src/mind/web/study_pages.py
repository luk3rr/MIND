# Filename: study_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages for the study session."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.study.rendering import card_sides
from mind.study.scheduler import Rating
from mind.study.service import StudyCard, StudyService
from mind.web.rendering import Registry, StudyDep, render

router = APIRouter(prefix="/w/{workspace_id}/study")


def _card_context(service: StudyService, card: StudyCard) -> dict[str, Any]:
    sides = card_sides(card.item.subtype, card.item.front, card.item.back)
    counts = service.counts()
    previews = service.previews(card)
    return {
        "card": card,
        "sides": sides,
        "previews": {int(rating): label for rating, label in previews.items()},
        "counts": counts,
        "kind": "new"
        if card.is_new
        else ("learning" if card.schedule and card.schedule.state != 2 else "review"),
        "ratings": [(int(r), r.name.lower()) for r in Rating],
    }


def _fragment(
    request: Request, workspace_id: int, service: StudyService, card: StudyCard | None
) -> HTMLResponse:
    if card is None:
        counts = service.counts()
        return render(
            request,
            "_study_done.html",
            workspace_id=workspace_id,
            counts=counts,
            distribution=service.rating_distribution(),
        )
    return render(
        request, "_study_card.html", workspace_id=workspace_id, **_card_context(service, card)
    )


def _is_htmx(request: Request) -> bool:
    return request.headers.get("hx-request") == "true"


@router.get("", response_class=HTMLResponse)
async def study_page(
    request: Request, workspace_id: int, registry: Registry, study: StudyDep
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    card = service.next_card()
    if card is None:
        context: dict[str, Any] = {
            "counts": service.counts(),
            "distribution": service.rating_distribution(),
        }
        template = "study_done_page.html"
    else:
        context = _card_context(service, card)
        template = "study.html"
    return render(
        request,
        template,
        workspace=info,
        active="study",
        workspace_id=workspace_id,
        **context,
    )


@router.post("/rate", response_model=None)
async def rate(
    request: Request,
    workspace_id: int,
    registry: Registry,
    study: StudyDep,
    item_id: Annotated[int, Form()],
    rating: Annotated[int, Form(ge=1, le=4)],
    elapsed_ms: Annotated[int | None, Form()] = None,
) -> Response:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    service.rate(item_id, Rating(rating), duration_ms=elapsed_ms)
    if not _is_htmx(request):
        return RedirectResponse(f"/w/{workspace_id}/study", status_code=303)
    return _fragment(request, workspace_id, service, service.next_card())


@router.post("/undo", response_model=None)
async def undo(
    request: Request, workspace_id: int, registry: Registry, study: StudyDep
) -> Response:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    restored = service.undo()
    if not _is_htmx(request):
        return RedirectResponse(f"/w/{workspace_id}/study", status_code=303)
    card = service.card(restored) if restored is not None else service.next_card()
    return _fragment(request, workspace_id, service, card)
