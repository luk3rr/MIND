# Filename: services.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Application services wired together once per process."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from mind.config import Settings
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

    async def aclose(self) -> None:
        await self.client.aclose()
