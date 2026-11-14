# Filename: charts.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Server-side geometry for the small SVG charts of the statistics page."""

from __future__ import annotations

from dataclasses import dataclass

from mind.stats.service import ActivityDay, RetentionDay

WIDTH = 300.0
HEIGHT = 80.0
PADDING = 4.0


@dataclass(frozen=True)
class Bar:
    x: float
    y: float
    width: float
    height: float
    label: str


def activity_bars(days: list[ActivityDay]) -> list[Bar]:
    """One bar per day, scaled to the busiest day (a day without activity has no bar)."""
    if not days:
        return []
    peak = max((d.total for d in days), default=0) or 1
    slot = WIDTH / len(days)
    usable = HEIGHT - PADDING
    bars = []
    for index, entry in enumerate(days):
        height = usable * entry.total / peak
        bars.append(
            Bar(
                x=round(index * slot + 1, 2),
                y=round(HEIGHT - height, 2),
                width=round(max(slot - 2, 1), 2),
                height=round(height, 2),
                label=f"{entry.day}: {entry.total}",
            )
        )
    return bars


def retention_points(days: list[RetentionDay]) -> str:
    """SVG polyline points for the days with reviews (0% at the bottom, 100% at the top)."""
    if len(days) < 2:
        return ""
    step = WIDTH / (len(days) - 1)
    points = []
    for index, entry in enumerate(days):
        if entry.rate is None:
            continue
        y = HEIGHT - PADDING - (HEIGHT - 2 * PADDING) * entry.rate
        points.append(f"{round(index * step, 2)},{round(y, 2)}")
    return " ".join(points)
