# Filename: guarded.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The guard that every real provider call goes through (consent, limit, cost log)."""

from __future__ import annotations

from collections.abc import Sequence

from mind.clock import utcnow
from mind.errors import ConsentRequired, MonthlyLimitReached
from mind.llm.consent import ConsentService
from mind.llm.costs import CostLedger
from mind.llm.provider import Provider, T
from mind.llm.types import Message, Usage
from mind.settings_service import SettingsService


class GuardedProvider:
    """Wraps a `Provider`: blocks without consent or over the limit, and records the cost."""

    def __init__(
        self,
        inner: Provider,
        consent: ConsentService,
        ledger: CostLedger,
        settings: SettingsService,
    ) -> None:
        self._inner = inner
        self._consent = consent
        self._ledger = ledger
        self._settings = settings

    @property
    def name(self) -> str:
        return self._inner.name

    @property
    def requires_consent(self) -> bool:
        return self._inner.requires_consent

    async def complete(
        self,
        messages: Sequence[Message],
        schema: type[T],
        *,
        model: str,
        max_retries: int = 2,
        purpose: str = "generation",
    ) -> tuple[T, Usage]:
        if self._inner.requires_consent and not self._consent.is_given(self._inner.name):
            raise ConsentRequired(
                "Aceite o envio de trechos do material ao provedor antes de gerar conteúdo."
            )
        limit = self._settings.get().monthly_limit_usd
        spent = self._ledger.spent_this_month()
        if spent >= limit:
            now = utcnow()
            raise MonthlyLimitReached(
                f"Gasto de US$ {spent:.2f} de US$ {limit:.2f} em {now.year}-{now.month:02d}."
            )
        parsed, usage = await self._inner.complete(
            messages, schema, model=model, max_retries=max_retries
        )
        cost = self._ledger.record(self._inner.name, model, purpose, usage)
        return parsed, usage.model_copy(update={"cost_usd": cost})
