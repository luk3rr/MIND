# Filename: practice_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages to practise questions with immediate feedback."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.practice.service import PracticeQuestion, PracticeService
from mind.study.service import StudyFilter
from mind.web.rendering import NotebookDep, PracticeDep, Registry, StudyDep, render
from mind.web.study_pages import FormFilter, QueryFilter

router = APIRouter(prefix="/w/{workspace_id}/practice")


def _redo(value: str) -> bool:
    return value == "1"


def _params(selection: StudyFilter, redo: bool) -> dict[str, str]:
    params = {k: v for k, v in selection.params().items() if k != "kind"}
    if redo:
        params["redo"] = "1"
    return params


def _context(
    service: PracticeService,
    question: PracticeQuestion,
    selection: StudyFilter,
    redo: bool,
) -> dict[str, Any]:
    counts = service.counts(selection)
    tag = (
        "new"
        if question.last_correct is None
        else "retry"
        if question.last_correct is False
        else "redo"
    )
    return {
        "question": question,
        "item": question.item,
        "tag": tag,
        "left": counts.to_practice,
        "filter_params": _params(selection, redo),
    }


def _empty(
    request: Request,
    workspace_id: int,
    service: PracticeService,
    selection: StudyFilter,
) -> HTMLResponse:
    counts = service.counts(selection)
    return render(
        request,
        "_practice_done.html",
        workspace_id=workspace_id,
        counts=counts,
        selection=selection,
        has_questions=bool(service.queue(1, selection, redo=True)),
    )


@router.get("", response_class=HTMLResponse)
async def practice_page(
    request: Request,
    workspace_id: int,
    registry: Registry,
    practice: PracticeDep,
    study: StudyDep,
    selection: QueryFilter,
    redo: Annotated[str, Query()] = "",
) -> HTMLResponse:
    info = registry.get(workspace_id)
    service = practice.for_workspace(workspace_id)
    again = _redo(redo)
    question = service.next_question(selection, redo=again)
    shared: dict[str, Any] = {
        "workspace": info,
        "active": "study",
        "workspace_id": workspace_id,
        "selection": selection,
        "facets": study.for_workspace(workspace_id).facets("question"),
        "redo": again,
        "counts": service.counts(selection),
    }
    if question is None:
        return render(request, "practice.html", done=True, **shared)
    return render(
        request,
        "practice.html",
        done=False,
        **_context(service, question, selection, again),
        **shared,
    )


@router.get("/next", response_class=HTMLResponse)
async def next_question(
    request: Request,
    workspace_id: int,
    registry: Registry,
    practice: PracticeDep,
    selection: QueryFilter,
    redo: Annotated[str, Query()] = "",
    after: Annotated[int | None, Query()] = None,
) -> HTMLResponse:
    registry.get(workspace_id)
    service = practice.for_workspace(workspace_id)
    again = _redo(redo)
    question = service.next_question(selection, redo=again, exclude=[after] if after else [])
    if question is None:
        return _empty(request, workspace_id, service, selection)
    return render(
        request,
        "_practice_question.html",
        workspace_id=workspace_id,
        **_context(service, question, selection, again),
    )


@router.post("/answer", response_class=HTMLResponse)
async def answer(
    request: Request,
    workspace_id: int,
    registry: Registry,
    practice: PracticeDep,
    notebook: NotebookDep,
    selection: FormFilter,
    item_id: Annotated[int, Form()],
    choice: Annotated[str, Form()] = "",
    seconds: Annotated[float | None, Form()] = None,
    redo: Annotated[str, Form()] = "",
) -> Response:
    registry.get(workspace_id)
    service = practice.for_workspace(workspace_id)
    result = service.answer(item_id, choice, seconds=seconds)
    question = service.question(item_id)
    if request.headers.get("hx-request") != "true":
        return RedirectResponse(f"/w/{workspace_id}/practice", status_code=303)
    return render(
        request,
        "_practice_feedback.html",
        workspace_id=workspace_id,
        item=question.item,
        result=result,
        seconds=seconds,
        has_error_card=notebook.for_workspace(workspace_id).card_for(item_id) is not None,
        filter_params=_params(selection, _redo(redo)),
    )
