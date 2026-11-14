# Filename: clock.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Isolated clock to make tests easier."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
