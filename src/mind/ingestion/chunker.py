# Filename: chunker.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Split segments into chunks that never cross a page (so quotes always fit in one chunk)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from mind.ingestion.extractors import Segment

TARGET_CHARS = 1200
HARD_MAX_CHARS = 1500
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


@dataclass(frozen=True)
class ChunkDraft:
    page: int | None
    section: str | None
    text: str


def _split_long(paragraph: str, hard_max: int) -> list[str]:
    """Split an oversized paragraph at sentence ends, then at whitespace."""
    pieces: list[str] = []
    current = ""
    for sentence in SENTENCE_END.split(paragraph):
        while len(sentence) > hard_max:
            cut = sentence.rfind(" ", 0, hard_max)
            cut = cut if cut > 0 else hard_max
            head, sentence = sentence[:cut], sentence[cut:].lstrip()
            if current:
                pieces.append(current)
                current = ""
            pieces.append(head)
        if current and len(current) + 1 + len(sentence) > hard_max:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def chunk_segments(
    segments: list[Segment],
    *,
    target: int = TARGET_CHARS,
    hard_max: int = HARD_MAX_CHARS,
) -> list[ChunkDraft]:
    drafts: list[ChunkDraft] = []
    for segment in segments:
        paragraphs: list[str] = []
        for paragraph in segment.text.split("\n\n"):
            paragraphs.extend(
                _split_long(paragraph, hard_max) if len(paragraph) > hard_max else [paragraph]
            )
        current: list[str] = []
        size = 0
        for paragraph in paragraphs:
            if current and size + len(paragraph) > target:
                drafts.append(ChunkDraft(segment.page, segment.section, "\n\n".join(current)))
                current, size = [], 0
            current.append(paragraph)
            size += len(paragraph) + 2
        if current:
            drafts.append(ChunkDraft(segment.page, segment.section, "\n\n".join(current)))
    return drafts
