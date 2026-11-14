# Filename: test_cost_ledger.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from datetime import timedelta

import httpx
import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.clock import utcnow
from mind.db.app_models import CostEntry, ModelPrice
from mind.llm.costs import CostLedger, PriceCatalog, month_bounds
from mind.llm.types import Usage

CATALOG = {
    "data": [
        {"id": "vendor/cheap", "pricing": {"prompt": "0.000001", "completion": "0.000002"}},
        {"id": "vendor/free", "pricing": {"prompt": "0", "completion": "0"}},
        {"id": "vendor/odd", "pricing": {"prompt": None, "completion": None}},
    ]
}


def client_returning(response: httpx.Response) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(lambda _request: response))


async def test_refresh_stores_prices_and_skips_entries_without_pricing(
    app_sessions: sessionmaker[Session],
) -> None:
    catalog = PriceCatalog(app_sessions)
    assert await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG))) is True
    assert catalog.known_models() == ["vendor/cheap", "vendor/free"]
    price = catalog.get("vendor/cheap")
    assert price is not None
    assert price.prompt_usd_per_token == pytest.approx(1e-6)
    assert catalog.get("vendor/odd") is None
    assert catalog.is_fresh() is True


async def test_fresh_cache_is_not_fetched_again_unless_forced(
    app_sessions: sessionmaker[Session],
) -> None:
    catalog = PriceCatalog(app_sessions)
    await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG)))
    broken = client_returning(httpx.Response(500))
    assert await catalog.refresh(broken) is True
    assert await catalog.refresh(broken, force=True) is False


async def test_stale_cache_is_refreshed(app_sessions: sessionmaker[Session]) -> None:
    with app_sessions() as session:
        session.add(
            ModelPrice(
                model="old/model",
                prompt_usd_per_token=1.0,
                completion_usd_per_token=1.0,
                fetched_at=utcnow() - timedelta(days=2),
            )
        )
        session.commit()
    catalog = PriceCatalog(app_sessions)
    assert catalog.is_fresh() is False
    assert await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG))) is True
    assert "vendor/cheap" in catalog.known_models()


@pytest.mark.parametrize(
    "response",
    [httpx.Response(200, text="not json"), httpx.Response(200, json={"unexpected": 1})],
)
async def test_unusable_catalog_responses_fail_softly(
    app_sessions: sessionmaker[Session], response: httpx.Response
) -> None:
    assert await PriceCatalog(app_sessions).refresh(client_returning(response)) is False


async def test_network_failure_keeps_the_last_prices(
    app_sessions: sessionmaker[Session],
) -> None:
    catalog = PriceCatalog(app_sessions)
    await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG)))

    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    offline = httpx.AsyncClient(transport=httpx.MockTransport(fail))
    assert await catalog.refresh(offline, force=True) is False
    assert catalog.get("vendor/cheap") is not None


async def test_estimate_uses_four_characters_per_token(
    app_sessions: sessionmaker[Session],
) -> None:
    catalog = PriceCatalog(app_sessions)
    await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG)))
    estimate = catalog.estimate("vendor/cheap", prompt_chars=4000, max_completion_tokens=500)
    assert estimate == pytest.approx(1000 * 1e-6 + 500 * 2e-6)
    assert catalog.estimate("unknown/model", 100, 100) is None


async def test_record_prefers_the_reported_cost_then_falls_back_to_tokens(
    app_sessions: sessionmaker[Session],
) -> None:
    catalog = PriceCatalog(app_sessions)
    await catalog.refresh(client_returning(httpx.Response(200, json=CATALOG)))
    ledger = CostLedger(app_sessions, catalog)

    reported = ledger.record("openrouter", "vendor/cheap", "generation", Usage(cost_usd=0.5))
    computed = ledger.record(
        "openrouter", "vendor/cheap", "judge", Usage(prompt_tokens=1000, completion_tokens=500)
    )
    unknown = ledger.record("openrouter", "unknown/model", "chat", Usage(prompt_tokens=9))

    assert reported == 0.5
    assert computed == pytest.approx(1000 * 1e-6 + 500 * 2e-6)
    assert unknown == 0.0
    assert ledger.spent_this_month() == pytest.approx(0.5 + computed)


def test_month_totals_and_lines_only_count_that_month(
    app_sessions: sessionmaker[Session],
) -> None:
    ledger = CostLedger(app_sessions, PriceCatalog(app_sessions))
    now = utcnow()
    ledger.record("openrouter", "m", "generation", Usage(cost_usd=1.0))
    previous_month = now.replace(day=1) - timedelta(days=1)
    with app_sessions() as session:
        session.add(
            CostEntry(
                at=previous_month,
                provider="openrouter",
                model="m",
                purpose="old",
                prompt_tokens=1,
                completion_tokens=1,
                cost_usd=9.0,
            )
        )
        session.commit()

    assert ledger.month_total(now.year, now.month) == 1.0
    assert ledger.month_total(previous_month.year, previous_month.month) == 9.0
    lines = ledger.month_lines(now.year, now.month)
    assert [(line.purpose, line.cost_usd) for line in lines] == [("generation", 1.0)]


def test_month_bounds_roll_over_the_year() -> None:
    start, end = month_bounds(2026, 12)
    assert (start.year, start.month) == (2026, 12)
    assert (end.year, end.month) == (2027, 1)
