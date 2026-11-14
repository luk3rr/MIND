# Filename: test_settings_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from typing import Any

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.errors import ValidationFailed
from mind.secrets import SecretStore
from mind.settings_service import DEFAULTS, SettingsService


def test_defaults_are_returned_before_anything_is_saved(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    settings = SettingsService(app_sessions, secrets).get()
    assert settings.provider == "openrouter"
    assert settings.generation_model == DEFAULTS["generation_model"]
    assert settings.monthly_limit_usd == 5.0


def test_updates_are_persisted(app_sessions: sessionmaker[Session], secrets: SecretStore) -> None:
    service = SettingsService(app_sessions, secrets)
    service.update(generation_model="vendor/cheap", monthly_limit_usd=2.5)
    reloaded = SettingsService(app_sessions, secrets).get()
    assert reloaded.generation_model == "vendor/cheap"
    assert reloaded.judge_model == DEFAULTS["judge_model"]
    assert reloaded.monthly_limit_usd == 2.5


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("provider", "other"),
        ("generation_model", "has space"),
        ("judge_model", ""),
        ("monthly_limit_usd", 0.0),
        ("monthly_limit_usd", -1.0),
        ("monthly_limit_usd", 1e9),
    ],
)
def test_invalid_values_are_rejected_with_the_field_name(
    app_sessions: sessionmaker[Session], secrets: SecretStore, field: str, value: object
) -> None:
    changes: dict[str, Any] = {field: value}
    with pytest.raises(ValidationFailed) as error:
        SettingsService(app_sessions, secrets).update(**changes)
    assert error.value.errors[0].field == field


def test_settings_never_contain_the_api_key(
    app_sessions: sessionmaker[Session], secrets: SecretStore
) -> None:
    secrets.save_api_key("sk-or-v1-supersecret")
    service = SettingsService(app_sessions, secrets)
    assert service.key_configured() is True
    dumped = json.dumps(service.get().model_dump())
    assert "supersecret" not in dumped
    assert "key" not in service.get().model_dump()
