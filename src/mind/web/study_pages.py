# Filename: study_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages for the study session."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.generation.schemas import CARD_SUBTYPES
from mind.study.rendering import card_sides
from mind.study.scheduler import Rating
from mind.study.service import StudyCard, StudyFilter, StudyService
from mind.web.rendering import Registry, StudyDep, render

router = APIRouter(prefix="/w/{workspace_id}/study")

KINDS = ("card", "question")


def _int_or_none(value: str) -> int | None:
    return int(value) if value.strip().isdigit() else None


def build_filter(kind: str, topic: str, material: str, subtype: str) -> StudyFilter:
    """Turn the raw selector fields into a filter; unknown values mean "no restriction"."""
    return StudyFilter(
        kind=kind if kind in KINDS else None,
        topic_id=_int_or_none(topic),
        material_id=_int_or_none(material),
        subtype=subtype if subtype in CARD_SUBTYPES else None,
    )


def filter_from_query(
    kind: Annotated[str, Query()] = "",
    topic: Annotated[str, Query()] = "",
    material: Annotated[str, Query()] = "",
    subtype: Annotated[str, Query()] = "",
) -> StudyFilter:
    return build_filter(kind, topic, material, subtype)


def filter_from_form(
    kind: Annotated[str, Form()] = "",
    topic: Annotated[str, Form()] = "",
    material: Annotated[str, Form()] = "",
    subtype: Annotated[str, Form()] = "",
) -> StudyFilter:
    return build_filter(kind, topic, material, subtype)


QueryFilter = Annotated[StudyFilter, Depends(filter_from_query)]
FormFilter = Annotated[StudyFilter, Depends(filter_from_form)]


def _card_context(service: StudyService, card: StudyCard, selection: StudyFilter) -> dict[str, Any]:
    sides = card_sides(card.item.subtype, card.item.front, card.item.back)
    counts = service.counts(selection=selection)
    previews = service.previews(card)
    return {
        "filter_params": selection.params(),
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
    request: Request,
    workspace_id: int,
    service: StudyService,
    card: StudyCard | None,
    selection: StudyFilter,
) -> HTMLResponse:
    if card is None:
        counts = service.counts(selection=selection)
        return render(
            request,
            "_study_done.html",
            workspace_id=workspace_id,
            counts=counts,
            distribution=service.rating_distribution(),
            selection=selection,
        )
    return render(
        request,
        "_study_card.html",
        workspace_id=workspace_id,
        **_card_context(service, card, selection),
    )


def _back(workspace_id: int, selection: StudyFilter) -> RedirectResponse:
    query = "&".join(f"{key}={value}" for key, value in selection.params().items())
    return RedirectResponse(
        f"/w/{workspace_id}/study{'?' + query if query else ''}", status_code=303
    )


def _is_htmx(request: Request) -> bool:
    return request.headers.get("hx-request") == "true"


@router.get("", response_class=HTMLResponse)
async def study_page(
    request: Request,
    workspace_id: int,
    registry: Registry,
    study: StudyDep,
    selection: QueryFilter,
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    card = service.next_card(selection=selection)
    if card is None:
        context: dict[str, Any] = {
            "counts": service.counts(selection=selection),
            "distribution": service.rating_distribution(),
            "filter_params": selection.params(),
        }
        template = "study_done_page.html"
    else:
        context = _card_context(service, card, selection)
        template = "study.html"
    return render(
        request,
        template,
        workspace=info,
        active="study",
        workspace_id=workspace_id,
        selection=selection,
        facets=service.facets(),
        subtypes=CARD_SUBTYPES,
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
    selection: FormFilter,
    elapsed_ms: Annotated[int | None, Form()] = None,
) -> Response:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    service.rate(item_id, Rating(rating), duration_ms=elapsed_ms)
    if not _is_htmx(request):
        return _back(workspace_id, selection)
    return _fragment(
        request, workspace_id, service, service.next_card(selection=selection), selection
    )


@router.post("/undo", response_model=None)
async def undo(
    request: Request,
    workspace_id: int,
    registry: Registry,
    study: StudyDep,
    selection: FormFilter,
) -> Response:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    restored = service.undo()
    if not _is_htmx(request):
        return _back(workspace_id, selection)
    card = (
        service.card(restored) if restored is not None else service.next_card(selection=selection)
    )
    return _fragment(request, workspace_id, service, card, selection)
