# Filename: redaction.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Redaction of API keys from every log record."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from typing import Any

from mind.secrets import SecretStore

KEY_PATTERN = re.compile(r"sk-or-[A-Za-z0-9_-]+")
MASK = "***"

_original_factory: Callable[..., logging.LogRecord] | None = None


def redact(text: str, secret: str | None) -> str:
    """Replace the current key and anything shaped like an OpenRouter key."""
    if secret:
        text = text.replace(secret, MASK)
    return KEY_PATTERN.sub(MASK, text)


def install_log_redaction(store: SecretStore) -> None:
    """Wrap the log record factory so no record carries the key. Safe to call twice."""
    global _original_factory
    if _original_factory is not None:
        return
    original = logging.getLogRecordFactory()
    _original_factory = original

    def factory(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = original(*args, **kwargs)
        message = record.getMessage()
        redacted = redact(message, store.api_key())
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return record

    logging.setLogRecordFactory(factory)


def uninstall_log_redaction() -> None:
    global _original_factory
    if _original_factory is not None:
        logging.setLogRecordFactory(_original_factory)
        _original_factory = None
