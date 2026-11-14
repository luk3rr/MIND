# Filename: test_log_redaction.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

from mind.redaction import MASK, install_log_redaction, redact, uninstall_log_redaction
from mind.secrets import ENV_NAME, SecretStore


@pytest.fixture
def store(tmp_path: Path) -> Iterator[SecretStore]:
    secret_store = SecretStore(tmp_path, env={ENV_NAME: "my-secret-token"})
    install_log_redaction(secret_store)
    yield secret_store
    uninstall_log_redaction()


def test_redact_masks_the_current_key_and_key_shaped_strings() -> None:
    text = "token my-secret-token and sk-or-v1-AbC_123-x leaked"
    assert redact(text, "my-secret-token") == f"token {MASK} and {MASK} leaked"
    assert redact("nothing here", None) == "nothing here"


def test_log_records_never_carry_the_key(
    store: SecretStore, caplog: pytest.LogCaptureFixture
) -> None:
    logger = logging.getLogger("mind.test")
    with caplog.at_level(logging.INFO, logger="mind.test"):
        logger.info("calling with %s", "my-secret-token")
        logger.warning("header Authorization: Bearer sk-or-v1-zzz999")
        logger.info("harmless message")
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "my-secret-token" not in text
    assert "sk-or-v1-zzz999" not in text
    assert "harmless message" in text
    assert store.is_configured()


def test_install_is_idempotent_and_uninstall_restores_the_factory(tmp_path: Path) -> None:
    before = logging.getLogRecordFactory()
    secret_store = SecretStore(tmp_path, env={})
    install_log_redaction(secret_store)
    wrapped = logging.getLogRecordFactory()
    install_log_redaction(secret_store)
    assert logging.getLogRecordFactory() is wrapped
    uninstall_log_redaction()
    assert logging.getLogRecordFactory() is before
    uninstall_log_redaction()
