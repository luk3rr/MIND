# Filename: provider_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""HTML pages for the AI provider: first-use assistant and settings."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from mind.clock import utcnow
from mind.errors import ValidationFailed
from mind.services import Services
from mind.web.rendering import ServicesDep, render

router = APIRouter()


def _provider_context(services: Services) -> dict[str, Any]:
    now = utcnow()
    provider = services.settings.get()
    return {
        "provider_settings": provider,
        "key_configured": services.secrets.is_configured(),
        "key_source": services.secrets.source(),
        "consent_given": services.consent.is_given(provider.provider),
        "spent": services.ledger.month_total(now.year, now.month),
        "month": f"{now.year}-{now.month:02d}",
        "known_models": services.catalog.known_models(),
    }


def _save(
    services: Services,
    api_key: str,
    generation_model: str,
    judge_model: str,
    monthly_limit_usd: float | None,
) -> None:
    """Persist the form values. Validation errors are raised before anything is written."""
    services.settings.update(
        generation_model=generation_model or None,
        judge_model=judge_model or None,
        monthly_limit_usd=monthly_limit_usd,
    )
    if api_key.strip():
        services.secrets.save_api_key(api_key)


@router.get("/setup", response_class=HTMLResponse)
async def setup(request: Request, services: ServicesDep, step: int = 1) -> HTMLResponse:
    template = "setup_consent.html" if step == 2 else "setup_key.html"
    return render(request, template, **_provider_context(services))


@router.post("/setup/key", response_model=None)
async def setup_key(
    request: Request,
    services: ServicesDep,
    api_key: Annotated[str, Form()] = "",
    generation_model: Annotated[str, Form()] = "",
    judge_model: Annotated[str, Form()] = "",
    monthly_limit_usd: Annotated[float | None, Form()] = None,
) -> Response:
    try:
        _save(services, api_key, generation_model, judge_model, monthly_limit_usd)
    except ValidationFailed as exc:
        return render(
            request,
            "setup_key.html",
            status_code=exc.status,
            form_error=exc.detail,
            **_provider_context(services),
        )
    return RedirectResponse("/setup?step=2", status_code=303)


@router.post("/setup/consent", response_model=None)
async def setup_consent(services: ServicesDep) -> Response:
    services.consent.give(services.settings.get().provider)
    return RedirectResponse("/", status_code=303)


@router.get("/settings", response_class=HTMLResponse)
async def provider_settings(request: Request, services: ServicesDep) -> HTMLResponse:
    return render(request, "provider.html", **_provider_context(services))


@router.post("/settings", response_model=None)
async def save_provider_settings(
    request: Request,
    services: ServicesDep,
    api_key: Annotated[str, Form()] = "",
    generation_model: Annotated[str, Form()] = "",
    judge_model: Annotated[str, Form()] = "",
    monthly_limit_usd: Annotated[float | None, Form()] = None,
) -> Response:
    try:
        _save(services, api_key, generation_model, judge_model, monthly_limit_usd)
    except ValidationFailed as exc:
        return render(
            request,
            "provider.html",
            status_code=exc.status,
            form_error=exc.detail,
            **_provider_context(services),
        )
    return RedirectResponse("/settings", status_code=303)


@router.post("/settings/key/clear", response_model=None)
async def clear_key(services: ServicesDep) -> Response:
    services.secrets.clear_api_key()
    return RedirectResponse("/settings", status_code=303)


@router.post("/settings/consent", response_model=None)
async def change_consent(
    services: ServicesDep, action: Annotated[str, Form()] = "give"
) -> Response:
    provider = services.settings.get().provider
    if action == "revoke":
        services.consent.revoke(provider)
    else:
        services.consent.give(provider)
    return RedirectResponse("/settings", status_code=303)


@router.post("/settings/models/refresh", response_model=None)
async def refresh_models(services: ServicesDep) -> Response:
    await services.catalog.refresh(services.client, force=True)
    return RedirectResponse("/settings", status_code=303)
