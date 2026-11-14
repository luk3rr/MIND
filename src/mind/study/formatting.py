# Filename: formatting.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Short pt-BR labels for time spans shown on the rating buttons."""

from __future__ import annotations

from datetime import timedelta

MINUTE = 60
HOUR = 3600
DAY = 86_400
MONTH_DAYS = 30
YEAR_DAYS = 365


def format_interval(span: timedelta) -> str:
    """ "1 min", "10 min", "3 h", "3 d", "2 meses", "1,2 anos"."""
    seconds = max(int(span.total_seconds()), 0)
    if seconds < MINUTE:
        return "< 1 min"
    if seconds < HOUR:
        return f"{round(seconds / MINUTE)} min"
    if seconds < DAY:
        return f"{round(seconds / HOUR)} h"
    days = round(seconds / DAY)
    if days < MONTH_DAYS:
        return f"{days} d"
    if days < YEAR_DAYS:
        months = max(round(days / MONTH_DAYS), 1)
        return f"{months} {'mês' if months == 1 else 'meses'}"
    years = days / YEAR_DAYS
    text = f"{years:.1f}".replace(".", ",")
    return f"{text} {'ano' if years < 1.5 and text == '1,0' else 'anos'}"
