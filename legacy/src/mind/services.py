# Filename: services.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Application services wired together once per process."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from mind.clock import utcnow
from mind.config import Settings
from mind.errors import ConsentRequired, MonthlyLimitReached, ProviderKeyMissing
from mind.llm.consent import ConsentService
from mind.llm.costs import CostLedger, PriceCatalog
from mind.llm.guarded import GuardedProvider
from mind.llm.openrouter import OpenRouterProvider
from mind.llm.provider import Provider
from mind.secrets import SecretStore
from mind.settings_service import SettingsService
from mind.workspaces.registry import WorkspaceRegistry


@dataclass
class Services:
    secrets: SecretStore
    settings: SettingsService
    consent: ConsentService
    catalog: PriceCatalog
    ledger: CostLedger
    provider: GuardedProvider
    client: httpx.AsyncClient

    @classmethod
    def build(
        cls,
        config: Settings,
        registry: WorkspaceRegistry,
        *,
        client: httpx.AsyncClient | None = None,
        inner_provider: Provider | None = None,
    ) -> Services:
        http = client or httpx.AsyncClient(timeout=120.0)
        sessions = registry.app_sessions
        secrets = SecretStore(config.data_dir)
        settings = SettingsService(sessions, secrets)
        consent = ConsentService(sessions)
        catalog = PriceCatalog(sessions)
        ledger = CostLedger(sessions, catalog)
        inner = inner_provider or OpenRouterProvider(secrets, client=http)
        return cls(
            secrets, settings, consent, catalog, ledger,
            GuardedProvider(inner, consent, ledger, settings), http,
        )  # fmt: skip

    @property
    def provider_name(self) -> str:
        return self.provider.name

    def needs_setup(self) -> bool:
        """True while the API key is missing or the user has not accepted sending excerpts."""
        if not self.provider.requires_consent:
            return False
        return not (self.secrets.is_configured() and self.consent.is_given(self.provider.name))

    def ensure_ready(self) -> None:
        """Raise a stable error when a model call would be refused (key, consent or limit)."""
        if self.provider.requires_consent:
            if not self.secrets.is_configured():
                raise ProviderKeyMissing("Configure a chave do OpenRouter em Configurações.")
            if not self.consent.is_given(self.provider.name):
                raise ConsentRequired("Aceite o envio de trechos ao provedor em Configurações.")
        limit = self.settings.get().monthly_limit_usd
        spent = self.ledger.spent_this_month()
        if spent >= limit:
            now = utcnow()
            raise MonthlyLimitReached(
                f"Gasto de US$ {spent:.2f} de US$ {limit:.2f} em {now.year}-{now.month:02d}."
            )

    async def aclose(self) -> None:
        await self.client.aclose()
