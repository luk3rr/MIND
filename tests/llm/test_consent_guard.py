# Filename: test_consent_guard.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from pydantic import BaseModel
from sqlalchemy.orm import Session, sessionmaker

from mind.errors import ConsentRequired, MonthlyLimitReached
from mind.llm.consent import ConsentService
from mind.llm.costs import CostLedger, PriceCatalog
from mind.llm.fake import FakeProvider
from mind.llm.guarded import GuardedProvider
from mind.llm.types import Message, Usage
from mind.secrets import SecretStore
from mind.settings_service import SettingsService

MESSAGES = [Message(role="user", content="hi")]


class Answer(BaseModel):
    text: str


def build(
    sessions: sessionmaker[Session], secrets: SecretStore, *, requires_consent: bool = True
) -> tuple[GuardedProvider, FakeProvider, ConsentService, CostLedger, SettingsService]:
    inner = FakeProvider(name="openrouter", requires_consent=requires_consent)
    inner.script(Answer, Answer(text="ok"))
    consent = ConsentService(sessions)
    ledger = CostLedger(sessions, PriceCatalog(sessions))
    settings = SettingsService(sessions, secrets)
    return GuardedProvider(inner, consent, ledger, settings), inner, consent, ledger, settings


async def test_without_consent_nothing_is_sent(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    guarded, inner, _, ledger, _ = build(app_sessions, secrets)
    with pytest.raises(ConsentRequired):
        await guarded.complete(MESSAGES, Answer, model="m")
    assert inner.calls == []
    assert ledger.spent_this_month() == 0.0


async def test_with_consent_the_call_goes_through_and_is_recorded(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    guarded, inner, consent, ledger, _ = build(app_sessions, secrets)
    consent.give("openrouter")
    inner.usage = Usage(prompt_tokens=100, completion_tokens=20, cost_usd=0.25)

    parsed, usage = await guarded.complete(MESSAGES, Answer, model="m", purpose="judge")

    assert parsed.text == "ok"
    assert usage.cost_usd == 0.25
    assert ledger.spent_this_month() == pytest.approx(0.25)
    assert len(inner.calls) == 1


async def test_providers_that_send_nothing_skip_the_consent_check(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    guarded, inner, _, _, _ = build(app_sessions, secrets, requires_consent=False)
    await guarded.complete(MESSAGES, Answer, model="m")
    assert len(inner.calls) == 1
    assert guarded.name == "openrouter"
    assert guarded.requires_consent is False


async def test_monthly_limit_blocks_new_calls(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    guarded, inner, consent, _, settings = build(app_sessions, secrets)
    consent.give("openrouter")
    settings.update(monthly_limit_usd=1.0)
    inner.usage = Usage(prompt_tokens=1, completion_tokens=1, cost_usd=1.0)

    await guarded.complete(MESSAGES, Answer, model="m")
    with pytest.raises(MonthlyLimitReached) as error:
        await guarded.complete(MESSAGES, Answer, model="m")

    assert "1.00" in error.value.detail
    assert len(inner.calls) == 1


def test_consent_can_be_given_checked_and_revoked(
    app_sessions: sessionmaker[Session],
) -> None:
    consent = ConsentService(app_sessions)
    assert consent.is_given("openrouter") is False
    assert consent.given_at("openrouter") is None
    consent.give("openrouter")
    consent.give("openrouter")
    assert consent.is_given("openrouter") is True
    given_at = consent.given_at("openrouter")
    assert given_at is not None
    assert given_at.tzinfo is not None
    consent.revoke("openrouter")
    consent.revoke("openrouter")
    assert consent.is_given("openrouter") is False
