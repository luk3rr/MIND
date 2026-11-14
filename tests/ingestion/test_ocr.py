# Filename: test_ocr.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import shutil
from pathlib import Path

import pytest

from mind.errors import ExtractionFailed, OcrUnavailable
from mind.ingestion.extractors import PdfExtractor
from mind.ingestion.ocr import OcrPage, TesseractEngine, parse_tsv
from tests.ingestion.pdfs import make_pdf

HEADER = (
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext"
)


def row(block: int, par: int, line: int, word: int, conf: float, text: str) -> str:
    return f"5\t1\t{block}\t{par}\t{line}\t{word}\t0\t0\t10\t10\t{conf}\t{text}"


class FakeOcr:
    """Answers with scripted pages, one per recognized image."""

    def __init__(self, pages: list[OcrPage], *, available: bool = True) -> None:
        self._pages = list(pages)
        self._available = available
        self.images: list[bytes] = []

    def available(self) -> bool:
        return self._available

    def recognize(self, png: bytes) -> OcrPage:
        self.images.append(png)
        return self._pages.pop(0)


def test_tsv_is_rebuilt_into_lines_paragraphs_and_a_mean_confidence() -> None:
    tsv = "\n".join(
        [
            HEADER,
            "4\t1\t1\t1\t1\t0\t0\t0\t0\t0\t-1\t",  # a structural row without text
            row(1, 1, 1, 1, 90, "A"),
            row(1, 1, 1, 2, 80, "mitocôndria"),
            row(1, 1, 2, 1, 70, "respira."),
            row(2, 1, 1, 1, 60, "Outro"),
            row(2, 1, 1, 2, -1, "ignorada"),
            row(2, 1, 1, 3, 100, "parágrafo"),
        ]
    )
    page = parse_tsv(tsv)
    assert page.text == "A mitocôndria\nrespira.\n\nOutro parágrafo"
    assert page.confidence == pytest.approx((90 + 80 + 70 + 60 + 100 + 0) / 5 / 100 - 0.0, abs=0.2)


def test_an_empty_or_malformed_tsv_has_no_text_and_zero_confidence() -> None:
    assert parse_tsv(HEADER) == OcrPage("", 0.0)
    assert parse_tsv("lixo\nnada\tnada") == OcrPage("", 0.0)


def test_a_scanned_pdf_is_read_page_by_page_with_the_mean_confidence(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "scan.pdf", ["", ""])
    ocr = FakeOcr(
        [
            OcrPage("Texto da página um lida por OCR.", 0.9),
            OcrPage("Texto da dois, também lido.", 0.7),
        ]
    )
    seen: list[str] = []

    result = PdfExtractor(ocr).extract(pdf, progress=lambda _v, message: seen.append(message))

    assert [(s.page, s.text[:5]) for s in result.segments] == [(1, "Texto"), (2, "Texto")]
    assert result.ocr_confidence == pytest.approx(0.8)
    assert result.page_count == 2
    assert result.warnings == []
    assert len(ocr.images) == 2
    assert ocr.images[0].startswith(b"\x89PNG")
    assert seen[-1] == "página 2 de 2"


def test_pages_with_native_text_are_not_sent_to_ocr(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "mixed.pdf", ["Esta página tem texto nativo suficiente.", ""])
    ocr = FakeOcr([OcrPage("Página escaneada lida.", 0.95)])

    result = PdfExtractor(ocr).extract(pdf)

    assert len(ocr.images) == 1
    assert [s.page for s in result.segments] == [1, 2]
    assert result.ocr_confidence == pytest.approx(0.95)


def test_a_text_pdf_has_no_ocr_confidence(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "text.pdf", ["Um PDF comum com texto nativo na página."])
    result = PdfExtractor(FakeOcr([])).extract(pdf)
    assert result.ocr_confidence is None


def test_without_an_engine_a_fully_scanned_pdf_reports_ocr_unavailable(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "scan.pdf", ["", ""])
    for engine in (None, FakeOcr([], available=False)):
        with pytest.raises(OcrUnavailable) as error:
            PdfExtractor(engine).extract(pdf)
        assert error.value.code == "OCR_UNAVAILABLE"
        assert error.value.status == 424
        assert "tesseract" in error.value.detail.lower()
        assert isinstance(error.value, ExtractionFailed)


def test_without_an_engine_a_mixed_pdf_keeps_its_text_pages_and_warns(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "mixed.pdf", ["Página com texto nativo suficiente.", "", ""])
    result = PdfExtractor(None).extract(pdf)
    assert [s.page for s in result.segments] == [1]
    assert result.warnings == ["2 página(s) sem texto foram ignoradas (OCR indisponível)."]


def test_an_engine_that_reads_nothing_is_an_extraction_failure(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "scan.pdf", [""])
    with pytest.raises(ExtractionFailed, match="não reconheceu"):
        PdfExtractor(FakeOcr([OcrPage("", 0.0)])).extract(pdf)


def test_cancellation_is_checked_between_ocr_pages(tmp_path: Path) -> None:
    pdf = make_pdf(tmp_path / "scan.pdf", ["", ""])
    ocr = FakeOcr([OcrPage("Texto lido por OCR na primeira.", 0.9)] * 2)

    class Stop(Exception):
        pass

    calls = 0

    def check() -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise Stop

    with pytest.raises(Stop):
        PdfExtractor(ocr).extract(pdf, check_cancelled=check)
    assert len(ocr.images) == 1


def test_a_missing_tesseract_makes_the_engine_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    engine = TesseractEngine()
    assert engine.available() is False
    with pytest.raises(ExtractionFailed, match="Tesseract"):
        engine.recognize(b"png")


def test_the_engine_only_uses_installed_languages(monkeypatch: pytest.MonkeyPatch) -> None:
    import subprocess

    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/bin/tesseract")

    def fake_run(command: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        listing = "List of available languages (3):\neng\nosd\nspa\n"
        return subprocess.CompletedProcess(command, 0, stdout=listing, stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert TesseractEngine("por+eng")._resolve() == "eng"
    assert TesseractEngine("spa+eng")._resolve() == "spa+eng"
    assert TesseractEngine("por")._resolve() == "eng"  # falls back to English when possible


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract is not installed")
def test_real_tesseract_reads_an_image_only_pdf(tmp_path: Path) -> None:
    import pymupdf

    source = pymupdf.open()
    page = source.new_page()
    page.insert_textbox(
        pymupdf.Rect(50, 50, 545, 400), "Mitochondria produce energy for the cell.", fontsize=24
    )
    image = page.get_pixmap(dpi=200).tobytes("png")
    scanned = pymupdf.open()
    scanned_page = scanned.new_page()
    scanned_page.insert_image(scanned_page.rect, stream=image)
    path = tmp_path / "scanned.pdf"
    scanned.save(path)

    result = PdfExtractor(TesseractEngine("eng")).extract(path)

    assert "mitochondria" in result.segments[0].text.lower()
    assert result.ocr_confidence is not None
    assert result.ocr_confidence > 0.5
