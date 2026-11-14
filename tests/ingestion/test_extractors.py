# Filename: test_extractors.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import pytest

from mind.errors import ExtractionFailed
from mind.ingestion.extractors import (
    PdfExtractor,
    TextExtractor,
    extractor_for,
    reflow_paragraphs,
)
from tests.ingestion.pdfs import make_locked_pdf, make_pdf


def test_pdf_pages_are_extracted_with_numbers_and_progress(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "a.pdf", ["Primeira página com função.", "", "Terceira página."])
    seen: list[tuple[float, str]] = []

    result = PdfExtractor().extract(
        pdf, progress=lambda value, message: seen.append((value, message))
    )

    assert result.page_count == 3
    assert [(s.page, "função" in s.text) for s in result.segments] == [(1, True), (3, False)]
    assert seen[-1] == (1.0, "página 3 de 3")


def test_corrupted_pdf_fails_with_a_readable_error(tmp_path: Path) -> None:
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"%PDF-1.4 this is not a real pdf")
    with pytest.raises(ExtractionFailed):
        PdfExtractor().extract(broken)
    empty = tmp_path / "empty.pdf"
    empty.write_bytes(b"")
    with pytest.raises(ExtractionFailed):
        PdfExtractor().extract(empty)


def test_pdf_without_any_text_points_to_ocr(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "blank.pdf", ["", ""])
    with pytest.raises(ExtractionFailed, match="escaneado"):
        PdfExtractor().extract(pdf)


def test_password_protected_pdf_is_rejected(tmp_path: Path) -> None:
    source = make_pdf(tmp_path / "plain.pdf", ["secret"])
    locked = make_locked_pdf(source, tmp_path / "locked.pdf")
    with pytest.raises(ExtractionFailed, match="senha"):
        PdfExtractor().extract(locked)


def test_cancellation_check_is_called_per_page(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "two.pdf", ["um", "dois"])
    calls = 0

    def check() -> None:
        nonlocal calls
        calls += 1

    PdfExtractor().extract(pdf, check_cancelled=check)
    assert calls == 2


def test_markdown_is_split_by_headings_with_a_section_path(tmp_path: Path) -> None:
    path = tmp_path / "notes.md"
    path.write_text(
        "Intro solta.\n\n# Biologia\n\nCélula.\n\n## Núcleo\n\nDNA.\n\n# Química\n\nÁtomo.\n"
    )
    result = TextExtractor().extract(path)
    assert [(s.section, s.text) for s in result.segments] == [
        (None, "Intro solta."),
        ("Biologia", "Célula."),
        ("Biologia > Núcleo", "DNA."),
        ("Química", "Átomo."),
    ]
    assert all(s.page is None for s in result.segments)


def test_markdown_ignores_headings_inside_code_fences(tmp_path: Path) -> None:
    path = tmp_path / "code.md"
    path.write_text("# Real\n\n```\n# not a heading\n```\n")
    result = TextExtractor().extract(path)
    assert [s.section for s in result.segments] == ["Real"]


def test_plain_text_has_no_sections_and_joins_wrapped_lines(tmp_path: Path) -> None:
    path = tmp_path / "plain.txt"
    path.write_text("# not a heading\nwrapped\nline\n\nSecond paragraph.")
    result = TextExtractor().extract(path)
    assert result.segments[0].section is None
    assert result.segments[0].text == "# not a heading wrapped line\n\nSecond paragraph."


def test_non_utf8_and_empty_text_files_fail(tmp_path: Path) -> None:
    bad = tmp_path / "bad.txt"
    bad.write_bytes(b"\xff\xfe\x00bad")
    with pytest.raises(ExtractionFailed, match="UTF-8"):
        TextExtractor().extract(bad)
    empty = tmp_path / "empty.md"
    empty.write_text("   \n")
    with pytest.raises(ExtractionFailed):
        TextExtractor().extract(empty)


def test_reflow_joins_lines_removes_hyphenation_and_keeps_paragraphs() -> None:
    raw = (
        "O sistema opera com várias\ncamadas inde-\npendentes entre si e cada uma\n"
        "tem uma função.\nNova ideia começa aqui e segue\npor mais uma linha longa também.\n"
    )
    text = reflow_paragraphs(raw)
    assert "independentes" in text
    assert text.count("\n\n") == 1
    assert text.split("\n\n")[1].startswith("Nova ideia")


def test_reflow_respects_blank_lines() -> None:
    assert reflow_paragraphs("um\n\ndois\n") == "um\n\ndois"
    assert reflow_paragraphs("   \n\n  ") == ""


def test_extractor_lookup_by_extension() -> None:
    assert extractor_for("Aula.PDF") is not None
    assert extractor_for("notes.markdown") is not None
    assert extractor_for("a.txt") is not None
    assert extractor_for("slides.pptx") is None
