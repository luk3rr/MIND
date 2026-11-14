# Filename: study.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Study resources of the v1 API: queue, ratings, undo, summary and settings."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from mind.api.deps import Registry, StudyDep
from mind.api.schemas import (
    ItemOut,
    Problem,
    RatingIn,
    RatingOut,
    StudyCardOut,
    StudySettingsOut,
    StudySettingsPatch,
    StudySummaryOut,
    UndoOut,
)
from mind.api.v1.items import to_out as item_out
from mind.study.rendering import Segment, card_sides
from mind.study.scheduler import Rating
from mind.study.service import StudyCard, StudyService

router = APIRouter(prefix="/workspaces/{workspace_id}/study", tags=["study"])

ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": Problem, "description": "Workspace or item not found."},
    422: {"model": Problem, "description": "Invalid rating or settings."},
}


def _text(segments: list[Segment]) -> str:
    return "".join(segment.text for segment in segments)


def card_out(service: StudyService, card: StudyCard) -> StudyCardOut:
    sides = card_sides(card.item.subtype, card.item.front, card.item.back)
    schedule = card.schedule
    item: ItemOut = item_out(card.item)
    return StudyCardOut(
        item=item,
        is_new=card.is_new,
        state=schedule.state if schedule else None,
        due=schedule.due if schedule else None,
        front_display=_text(sides.front),
        back_display=_text(sides.back),
        intervals={int(r): label for r, label in service.previews(card).items()},
    )


@router.get("/queue", response_model=list[StudyCardOut], responses=ERRORS, summary="Upcoming cards")
async def queue(
    workspace_id: int,
    study: StudyDep,
    registry: Registry,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[StudyCardOut]:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    return [card_out(service, card) for card in service.queue(limit)]


@router.post("/reviews", response_model=RatingOut, responses=ERRORS, summary="Rate a card (1 to 4)")
async def rate(workspace_id: int, body: RatingIn, study: StudyDep, registry: Registry) -> RatingOut:
    registry.get(workspace_id)
    result = study.for_workspace(workspace_id).rate(
        body.item_id, Rating(body.rating), duration_ms=body.duration_ms
    )
    return RatingOut(
        item_id=body.item_id,
        state=result.state,
        due=result.due,
        reps=result.reps,
        lapses=result.lapses,
    )


@router.post("/reviews/undo", response_model=UndoOut, summary="Undo the last rating")
async def undo(workspace_id: int, study: StudyDep, registry: Registry) -> UndoOut:
    registry.get(workspace_id)
    return UndoOut(item_id=study.for_workspace(workspace_id).undo())


@router.get(
    "/summary", response_model=StudySummaryOut, responses=ERRORS, summary="Numbers of the day"
)
async def summary(workspace_id: int, study: StudyDep, registry: Registry) -> StudySummaryOut:
    registry.get(workspace_id)
    service = study.for_workspace(workspace_id)
    counts, config = service.counts(), service.settings()
    return StudySummaryOut(
        learning=counts.learning,
        review=counts.review,
        new_available=counts.new_available,
        reviewed_today=counts.reviewed_today,
        new_studied_today=counts.new_studied_today,
        to_study=counts.to_study,
        daily_goal=config.daily_goal,
        new_per_day=config.new_per_day,
    )


@router.get(
    "/settings", response_model=StudySettingsOut, responses=ERRORS, summary="Study settings"
)
async def get_settings(workspace_id: int, study: StudyDep, registry: Registry) -> StudySettingsOut:
    registry.get(workspace_id)
    config = study.for_workspace(workspace_id).settings()
    return StudySettingsOut(**config.__dict__)


@router.patch(
    "/settings", response_model=StudySettingsOut, responses=ERRORS, summary="Change study settings"
)
async def patch_settings(
    workspace_id: int, body: StudySettingsPatch, study: StudyDep, registry: Registry
) -> StudySettingsOut:
    registry.get(workspace_id)
    config = study.for_workspace(workspace_id).update_settings(
        **body.model_dump(exclude_unset=True)
    )
    return StudySettingsOut(**config.__dict__)
