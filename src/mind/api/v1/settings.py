# Filename: settings.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Settings and consent resources of the v1 API (the API key is never exposed)."""

from __future__ import annotations

from fastapi import APIRouter

from mind.api.deps import ServicesDep
from mind.api.schemas import ConsentIn, Problem, SettingsOut, SettingsPatch
from mind.services import Services

router = APIRouter(prefix="/settings", tags=["settings"])

INVALID: dict[int | str, dict[str, object]] = {
    422: {"model": Problem, "description": "Invalid settings."}
}


def to_out(services: Services) -> SettingsOut:
    current = services.settings.get()
    return SettingsOut(
        **current.model_dump(),
        key_configured=services.secrets.is_configured(),
        key_source=services.secrets.source(),
        consent_given=services.consent.is_given(current.provider),
    )


@router.get("", response_model=SettingsOut, summary="Get the provider settings")
async def get_settings(services: ServicesDep) -> SettingsOut:
    return to_out(services)


@router.patch(
    "",
    response_model=SettingsOut,
    responses=INVALID,
    summary="Update models, provider or the monthly limit",
)
async def patch_settings(body: SettingsPatch, services: ServicesDep) -> SettingsOut:
    services.settings.update(**body.model_dump(exclude_unset=True))
    return to_out(services)


@router.post(
    "/consent",
    response_model=SettingsOut,
    summary="Accept or revoke sending material excerpts to the provider",
)
async def set_consent(body: ConsentIn, services: ServicesDep) -> SettingsOut:
    provider = services.settings.get().provider
    if body.accepted:
        services.consent.give(provider)
    else:
        services.consent.revoke(provider)
    return to_out(services)
