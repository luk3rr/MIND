# Filename: formatting.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Display formatting for dates and percentages (pt-BR)."""

from __future__ import annotations

from datetime import date, datetime

DASH = chr(0x2013)  # shown where a number is not available


def percent(value: float | None) -> str:
    """0.756 -> "76%"; a missing value shows a dash."""
    return DASH if value is None else f"{round(value * 100)}%"


def br_day(value: str | date) -> str:
    """ "2026-11-14" -> "14/11/2026"."""
    day = value if isinstance(value, date) else date.fromisoformat(value)
    return day.strftime("%d/%m/%Y")


def br_datetime(value: datetime) -> str:
    """A moment in the user's local time zone: "14/11/2026 12:30"."""
    return value.astimezone().strftime("%d/%m/%Y %H:%M")
