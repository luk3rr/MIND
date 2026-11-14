# Filename: source_checker.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Deterministic check that a quote really appears in its source chunk (design ADR-5)."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

MIN_QUOTE_CHARS = 15

# Typographic quotes and dashes mapped to their ASCII forms (written as code points so the
# source file stays free of ambiguous characters).
QUOTE_MAP = {
    **dict.fromkeys((0x2018, 0x2019, 0x201A, 0x201B), "'"),
    **dict.fromkeys((0x201C, 0x201D, 0x201E, 0x00AB, 0x00BB), '"'),
    **dict.fromkeys((0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2212), "-"),
}
IGNORED = {0x00AD, 0x200B, 0x200C, 0x200D, 0xFEFF}  # soft hyphen, zero-width, BOM


@dataclass(frozen=True)
class QuoteMatch:
    """Half-open range `[start, end)` of the quote inside the original chunk text."""

    start: int
    end: int


@dataclass(frozen=True)
class CheckResult:
    valid: bool
    reason: str | None = None


def normalize(text: str) -> tuple[str, list[int]]:
    """Normalize text for comparison and map each output character to its source index.

    Ligatures are expanded (NFKC), typographic quotes and dashes become ASCII, invisible
    characters are dropped, whitespace runs collapse to one space and case is folded.
    """
    out: list[str] = []
    positions: list[int] = []
    pending_space = False
    for index, char in enumerate(text):
        if ord(char) in IGNORED:
            continue
        for piece in unicodedata.normalize("NFKC", QUOTE_MAP.get(ord(char), char)):
            if piece.isspace():
                pending_space = bool(out)
                continue
            if pending_space:
                out.append(" ")
                positions.append(index)
                pending_space = False
            for folded in piece.casefold():
                out.append(folded)
                positions.append(index)
    return "".join(out), positions


def locate_quote(chunk_text: str, quote: str) -> QuoteMatch | None:
    """Find `quote` in `chunk_text` ignoring spacing, quote style, ligatures and case."""
    needle, _ = normalize(quote)
    if not needle:
        return None
    haystack, positions = normalize(chunk_text)
    start = haystack.find(needle)
    if start < 0:
        return None
    last = start + len(needle) - 1
    return QuoteMatch(positions[start], positions[last] + 1)


class SourceChecker:
    def __init__(self, min_chars: int = MIN_QUOTE_CHARS) -> None:
        self._min_chars = min_chars

    def check(self, quote: str, chunk_text: str) -> CheckResult:
        normalized, _ = normalize(quote)
        if len(normalized) < self._min_chars:
            return CheckResult(False, "quote_too_short")
        if locate_quote(chunk_text, quote) is None:
            return CheckResult(False, "quote_not_in_chunk")
        return CheckResult(True)
