# Filename: costs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Cost resources of the v1 API: monthly spending and call estimates."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Query

from mind.api.deps import ServicesDep
from mind.api.schemas import CostLineOut, CostsOut, EstimateIn, EstimateOut, Problem
from mind.clock import utcnow
from mind.errors import FieldError, ValidationFailed

router = APIRouter(prefix="/costs", tags=["costs"])

MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


@router.get(
    "",
    response_model=CostsOut,
    responses={422: {"model": Problem, "description": "Invalid month."}},
    summary="Spending of a month (defaults to the current one)",
)
async def get_costs(
    services: ServicesDep,
    month: Annotated[str | None, Query(description="YYYY-MM")] = None,
) -> CostsOut:
    now = utcnow()
    label = month or f"{now.year}-{now.month:02d}"
    match = MONTH.match(label)
    if match is None:
        raise ValidationFailed(
            "Use o formato AAAA-MM.", errors=[FieldError("month", "Formato esperado: AAAA-MM.")]
        )
    year, month_number = int(match[1]), int(match[2])
    lines = services.ledger.month_lines(year, month_number)
    return CostsOut(
        month=label,
        total_usd=services.ledger.month_total(year, month_number),
        limit_usd=services.settings.get().monthly_limit_usd,
        entries=[CostLineOut(**line.__dict__) for line in lines],
    )


@router.post("/estimate", response_model=EstimateOut, summary="Estimate the cost of one call")
async def estimate(body: EstimateIn, services: ServicesDep) -> EstimateOut:
    value = services.catalog.estimate(body.model, body.prompt_chars, body.max_completion_tokens)
    return EstimateOut(estimated_usd=value)
