# Filename: settings_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Persistent provider settings (models and monthly spending limit)."""

from __future__ import annotations

import re

from pydantic import BaseModel
from sqlalchemy.orm import Session, sessionmaker

from mind.db.app_models import Setting
from mind.errors import FieldError, ValidationFailed
from mind.secrets import SecretStore

SUPPORTED_PROVIDERS = ("openrouter",)
MODEL_PATTERN = re.compile(r"^[\w.\-:/]{1,128}$")
MAX_MONTHLY_LIMIT = 10_000.0

DEFAULTS: dict[str, str] = {
    "provider": "openrouter",
    "generation_model": "anthropic/claude-haiku-5.5",
    "judge_model": "anthropic/claude-sonnet-5.5",
    "monthly_limit_usd": "5.0",
}


class ProviderSettings(BaseModel):
    """What the user can configure about the provider. It never contains the API key."""

    provider: str
    generation_model: str
    judge_model: str
    monthly_limit_usd: float


class SettingsService:
    def __init__(self, sessions: sessionmaker[Session], secrets: SecretStore) -> None:
        self._sessions = sessions
        self._secrets = secrets

    def get(self) -> ProviderSettings:
        with self._sessions() as session:
            stored = {row.key: row.value for row in session.query(Setting).all()}
        merged = {**DEFAULTS, **stored}
        return ProviderSettings(
            provider=merged["provider"],
            generation_model=merged["generation_model"],
            judge_model=merged["judge_model"],
            monthly_limit_usd=float(merged["monthly_limit_usd"]),
        )

    def key_configured(self) -> bool:
        return self._secrets.is_configured()

    def update(
        self,
        *,
        provider: str | None = None,
        generation_model: str | None = None,
        judge_model: str | None = None,
        monthly_limit_usd: float | None = None,
    ) -> ProviderSettings:
        changes: dict[str, str] = {}
        errors: list[FieldError] = []
        if provider is not None:
            if provider not in SUPPORTED_PROVIDERS:
                errors.append(FieldError("provider", "Provedor não suportado."))
            else:
                changes["provider"] = provider
        for field, value in (("generation_model", generation_model), ("judge_model", judge_model)):
            if value is None:
                continue
            if not MODEL_PATTERN.match(value.strip()):
                errors.append(FieldError(field, "Informe o identificador do modelo."))
            else:
                changes[field] = value.strip()
        if monthly_limit_usd is not None:
            if not 0 < monthly_limit_usd <= MAX_MONTHLY_LIMIT:
                errors.append(FieldError("monthly_limit_usd", "Informe um valor maior que zero."))
            else:
                changes["monthly_limit_usd"] = str(monthly_limit_usd)
        if errors:
            raise ValidationFailed("Configurações inválidas.", errors=errors)
        with self._sessions() as session:
            for key, value in changes.items():
                session.merge(Setting(key=key, value=value))
            session.commit()
        return self.get()
