# Filename: test_settings_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from mind.clock import utcnow
from mind.db.app_models import CostEntry, ModelPrice
from mind.services import Services

KEY = "sk-or-v1-apisecret999"


def services_of(client: TestClient) -> Services:
    services: Services = client.app.state.services  # type: ignore[attr-defined]
    return services


def app_session(client: TestClient) -> Session:
    return services_of(client).catalog._sessions()


def test_default_settings_have_no_key_and_no_consent(client: TestClient) -> None:
    body = client.get("/api/v1/settings").json()
    assert body["provider"] == "openrouter"
    assert body["monthly_limit_usd"] == 5.0
    assert (body["key_configured"], body["key_source"], body["consent_given"]) == (
        False,
        None,
        False,
    )


def test_the_api_key_never_appears_in_any_settings_response(client: TestClient) -> None:
    services_of(client).secrets.save_api_key(KEY)
    responses = [
        client.get("/api/v1/settings"),
        client.patch("/api/v1/settings", json={"monthly_limit_usd": 2}),
        client.post("/api/v1/settings/consent", json={"accepted": True}),
        client.get("/api/v1/costs"),
        client.get("/api/openapi.json"),
    ]
    for response in responses:
        assert KEY not in response.text
    settings = client.get("/api/v1/settings").json()
    assert (settings["key_configured"], settings["key_source"]) == (True, "file")


def test_patch_updates_only_the_given_fields(client: TestClient) -> None:
    body = client.patch(
        "/api/v1/settings", json={"generation_model": "vendor/cheap", "monthly_limit_usd": 1.5}
    ).json()
    assert body["generation_model"] == "vendor/cheap"
    assert body["monthly_limit_usd"] == 1.5
    assert body["judge_model"].startswith("anthropic/")


def test_patch_with_invalid_values_is_a_validation_problem(client: TestClient) -> None:
    response = client.patch("/api/v1/settings", json={"monthly_limit_usd": -1})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert response.json()["errors"][0]["field"] == "monthly_limit_usd"
    assert client.patch("/api/v1/settings", json={"monthly_limit_usd": "abc"}).status_code == 422


def test_consent_can_be_accepted_and_revoked(client: TestClient) -> None:
    assert client.post("/api/v1/settings/consent", json={"accepted": True}).json()["consent_given"]
    assert not client.post("/api/v1/settings/consent", json={"accepted": False}).json()[
        "consent_given"
    ]


def test_costs_report_the_month_total_limit_and_lines(client: TestClient) -> None:
    now = utcnow()
    last_month = now.replace(day=1) - timedelta(days=1)
    with app_session(client) as session:
        for when, cost in ((now, 0.75), (last_month, 4.0)):
            session.add(
                CostEntry(
                    at=when,
                    provider="openrouter",
                    model="vendor/cheap",
                    purpose="generation",
                    prompt_tokens=10,
                    completion_tokens=5,
                    cost_usd=cost,
                )
            )
        session.commit()

    current = client.get("/api/v1/costs").json()
    assert current["month"] == f"{now.year}-{now.month:02d}"
    assert current["total_usd"] == 0.75
    assert current["limit_usd"] == 5.0
    assert [e["cost_usd"] for e in current["entries"]] == [0.75]

    previous = client.get(f"/api/v1/costs?month={last_month.year}-{last_month.month:02d}").json()
    assert previous["total_usd"] == 4.0


def test_costs_reject_a_malformed_month(client: TestClient) -> None:
    response = client.get("/api/v1/costs?month=2026-13")
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "month"


def test_estimate_uses_the_cached_price_or_returns_null(client: TestClient) -> None:
    with app_session(client) as session:
        session.add(
            ModelPrice(
                model="vendor/cheap",
                prompt_usd_per_token=1e-6,
                completion_usd_per_token=2e-6,
                fetched_at=utcnow(),
            )
        )
        session.commit()

    known = client.post(
        "/api/v1/costs/estimate",
        json={"model": "vendor/cheap", "prompt_chars": 4000, "max_completion_tokens": 500},
    ).json()
    assert known["estimated_usd"] == 1000 * 1e-6 + 500 * 2e-6

    unknown = client.post(
        "/api/v1/costs/estimate",
        json={"model": "who/knows", "prompt_chars": 10, "max_completion_tokens": 10},
    ).json()
    assert unknown["estimated_usd"] is None
    negative = client.post(
        "/api/v1/costs/estimate",
        json={"model": "m", "prompt_chars": -1, "max_completion_tokens": 1},
    )
    assert negative.status_code == 422
