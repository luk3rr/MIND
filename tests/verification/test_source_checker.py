# Filename: test_source_checker.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest

from mind.verification.source_checker import (
    MIN_QUOTE_CHARS,
    SourceChecker,
    locate_quote,
    normalize,
)

CHUNK = (
    "A mitocôndria é a organela respon-\n"
    "sável pela respiração celular. “Ela produz ATP” — a moeda de energia — em grande\n"
    "quantidade.  A ﬁssão é diferente."
)


def test_exact_quote_is_valid() -> None:
    assert SourceChecker().check("a organela respon-\nsável pela respiração celular", CHUNK).valid


def test_whitespace_case_and_line_breaks_are_ignored() -> None:
    quote = "A MITOCÔNDRIA   é a organela\n respon- sável"
    assert SourceChecker().check(quote, CHUNK).valid


def test_curly_quotes_dashes_and_ligatures_match_their_plain_forms() -> None:
    checker = SourceChecker()
    assert checker.check('"Ela produz ATP" - a moeda de energia - em grande', CHUNK).valid
    assert checker.check("A fissão é diferente.", CHUNK).valid


def test_soft_hyphens_and_zero_width_characters_are_ignored() -> None:
    text = "orga­nela​ responsável pela respiração"
    assert SourceChecker().check("organela responsável pela respiração", text).valid


def test_a_paraphrase_is_not_a_quote() -> None:
    result = SourceChecker().check("a mitocôndria gera energia para a célula inteira", CHUNK)
    assert (result.valid, result.reason) == (False, "quote_not_in_chunk")


def test_short_quotes_are_rejected_even_if_present() -> None:
    result = SourceChecker().check("ATP", CHUNK)
    assert (result.valid, result.reason) == (False, "quote_too_short")
    assert len("x" * MIN_QUOTE_CHARS) == MIN_QUOTE_CHARS


def test_empty_quote_or_chunk_is_invalid() -> None:
    assert not SourceChecker().check("", CHUNK).valid
    assert not SourceChecker().check("a organela responsável pela respiração", "").valid


def test_locate_returns_the_range_in_the_original_text() -> None:
    match = locate_quote(CHUNK, "ela produz atp")
    assert match is not None
    assert CHUNK[match.start : match.end] == "Ela produz ATP"


def test_locate_covers_expanded_ligatures_and_spans_line_breaks() -> None:
    match = locate_quote(CHUNK, "A fissão é diferente")
    assert match is not None
    assert CHUNK[match.start : match.end] == "A ﬁssão é diferente"
    across = locate_quote(CHUNK, "em grande quantidade")
    assert across is not None
    assert CHUNK[across.start : across.end] == "em grande\nquantidade"


def test_locate_without_a_match_returns_none() -> None:
    assert locate_quote(CHUNK, "inexistente neste texto") is None
    assert locate_quote(CHUNK, "   ") is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  A   B\n\tC ", "a b c"),
        (f"{chr(0x2018)}x{chr(0x2019)}", "'x'"),
        ("Straße", "strasse"),
        ("", ""),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw)[0] == expected
