# Filename: rendering.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The two sides of a card as text segments (cloze gaps are marked as hits)."""

from __future__ import annotations

import re
from dataclasses import dataclass

CLOZE = re.compile(r"\{\{c\d+::(.+?)\}\}", re.S)
GAP = "[…]"


@dataclass(frozen=True)
class Segment:
    text: str
    hit: bool = False


@dataclass(frozen=True)
class CardSides:
    front: list[Segment]
    back: list[Segment]


def _cloze_segments(text: str, *, reveal: bool) -> list[Segment]:
    segments: list[Segment] = []
    position = 0
    for match in CLOZE.finditer(text):
        if match.start() > position:
            segments.append(Segment(text[position : match.start()]))
        segments.append(Segment(match.group(1) if reveal else GAP, hit=True))
        position = match.end()
    if position < len(text):
        segments.append(Segment(text[position:]))
    return segments


def card_sides(subtype: str, front: str, back: str) -> CardSides:
    """Front and back segments for a card of the given type."""
    if subtype == "cloze":
        extra = [Segment(f"\n\n{back.strip()}")] if back.strip() else []
        return CardSides(
            front=_cloze_segments(front, reveal=False),
            back=[*_cloze_segments(front, reveal=True), *extra],
        )
    return CardSides(front=[Segment(front)], back=[Segment(back)])
