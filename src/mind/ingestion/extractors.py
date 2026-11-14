# Filename: extractors.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Text extractors: turn a file into page or section segments."""

from __future__ import annotations

import itertools
import re
import statistics
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from zipfile import BadZipFile

import docx
import pymupdf
from docx.opc.exceptions import PackageNotFoundError
from docx.text.paragraph import Paragraph as DocxParagraph

from mind.errors import ExtractionFailed, OcrUnavailable
from mind.ingestion.ocr import INSTALL_HINT, OcrEngine

ProgressCallback = Callable[[float, str], None]
CancelCheck = Callable[[], None]

MIN_PAGE_CHARS = 20
OCR_DPI = 200
PARAGRAPH_END = re.compile(r"[.!?:;]$")
HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


@dataclass(frozen=True)
class Segment:
    """A run of paragraphs from one page (PDF) or one section (Markdown/text)."""

    text: str
    page: int | None = None
    section: str | None = None


@dataclass(frozen=True)
class ExtractionResult:
    segments: list[Segment]
    page_count: int | None = None
    ocr_confidence: float | None = None
    warnings: list[str] = field(default_factory=list)
    title: str | None = None


class Extractor(Protocol):
    @property
    def kind(self) -> str: ...

    @property
    def extensions(self) -> tuple[str, ...]: ...

    def extract(
        self,
        path: Path,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult: ...


def reflow_paragraphs(raw: str) -> str:
    """Rebuild paragraphs from line-broken text; paragraphs are separated by a blank line."""
    raw = HYPHEN_BREAK.sub(r"\1\2", raw.replace("\r\n", "\n"))
    blocks = [block for block in re.split(r"\n\s*\n", raw) if block.strip()]
    paragraphs: list[str] = []
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue
        typical = statistics.median(len(line) for line in lines) if len(lines) > 2 else 0
        current = lines[0]
        for previous, line in itertools.pairwise(lines):
            short_end = typical and len(previous) < 0.7 * typical
            if short_end and PARAGRAPH_END.search(previous):
                paragraphs.append(current)
                current = line
            else:
                current = f"{current} {line}"
        paragraphs.append(current)
    return "\n\n".join(paragraphs)


class PdfExtractor:
    kind = "pdf"
    extensions = (".pdf",)

    def __init__(self, ocr: OcrEngine | None = None, min_chars: int = MIN_PAGE_CHARS) -> None:
        self._ocr = ocr
        self._min_chars = min_chars

    def extract(
        self,
        path: Path,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult:
        try:
            document = pymupdf.open(path)
        except (pymupdf.FileDataError, pymupdf.EmptyFileError, RuntimeError) as exc:
            raise ExtractionFailed("O PDF está corrompido ou não pôde ser aberto.") from exc
        can_ocr = self._ocr is not None and self._ocr.available()
        segments: list[Segment] = []
        confidences: list[float] = []
        blank_pages = 0
        with document:
            if document.needs_pass:
                raise ExtractionFailed("O PDF está protegido por senha.")
            total = document.page_count
            for number in range(1, total + 1):
                page = document.load_page(number - 1)
                if check_cancelled is not None:
                    check_cancelled()
                text = reflow_paragraphs(page.get_text("text", sort=True))
                if len(text) < self._min_chars and self._ocr is not None and can_ocr:
                    recognized = self._ocr.recognize(page.get_pixmap(dpi=OCR_DPI).tobytes("png"))
                    text = reflow_paragraphs(recognized.text)
                    if text:
                        confidences.append(recognized.confidence)
                elif len(text) < self._min_chars:
                    blank_pages += 1
                if text:
                    segments.append(Segment(text=text, page=number))
                if progress is not None:
                    progress(number / total, f"página {number} de {total}")
        if not segments:
            if not can_ocr:
                raise OcrUnavailable(
                    f"Nenhum texto foi encontrado: o PDF parece escaneado e o OCR não está "
                    f"disponível. {INSTALL_HINT}"
                )
            raise ExtractionFailed("O OCR não reconheceu nenhum texto neste PDF.")
        warnings = []
        if blank_pages:
            warnings.append(
                f"{blank_pages} página(s) sem texto foram ignoradas (OCR indisponível)."
            )
        confidence = sum(confidences) / len(confidences) if confidences else None
        return ExtractionResult(
            segments=segments, page_count=total, ocr_confidence=confidence, warnings=warnings
        )


def markdown_segments(content: str, *, is_markdown: bool = True) -> list[Segment]:
    """Split Markdown (or plain text) into sections with their heading path."""
    segments: list[Segment] = []
    stack: list[tuple[int, str]] = []
    buffer: list[str] = []
    in_fence = False

    def flush() -> None:
        text = "\n".join(buffer).strip()
        buffer.clear()
        if text:
            section = " > ".join(title for _, title in stack) or None
            segments.append(Segment(text=_paragraphs(text), section=section))

    for line in content.splitlines():
        if is_markdown and line.lstrip().startswith("```"):
            in_fence = not in_fence
        heading = None if in_fence or not is_markdown else HEADING.match(line)
        if heading:
            flush()
            level = len(heading.group(1))
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, heading.group(2)))
        else:
            buffer.append(line)
    flush()
    return segments


class TextExtractor:
    """Markdown (split by headings) and plain text."""

    kind = "text"
    extensions = (".md", ".markdown", ".txt")

    def extract(
        self,
        path: Path,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult:
        try:
            content = path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ExtractionFailed("O arquivo não está em UTF-8.") from exc
        segments = markdown_segments(
            content, is_markdown=path.suffix.lower() in (".md", ".markdown")
        )
        if progress is not None:
            progress(1.0, "texto lido")
        if not segments:
            raise ExtractionFailed("O arquivo não tem texto.")
        return ExtractionResult(segments=segments)


class DocxExtractor:
    """Word documents: headings become sections, tables become ` | ` separated lines."""

    kind = "docx"
    extensions = (".docx",)

    def extract(
        self,
        path: Path,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult:
        try:
            document = docx.Document(str(path))
        except (PackageNotFoundError, BadZipFile, KeyError, ValueError) as exc:
            raise ExtractionFailed(
                "O arquivo Word está corrompido ou não pôde ser aberto."
            ) from exc
        segments: list[Segment] = []
        stack: list[tuple[int, str]] = []
        buffer: list[str] = []

        def flush() -> None:
            text = "\n\n".join(line for line in buffer if line.strip()).strip()
            buffer.clear()
            if text:
                section = " > ".join(title for _, title in stack) or None
                segments.append(Segment(text=text, section=section))

        for block in document.iter_inner_content():
            if check_cancelled is not None:
                check_cancelled()
            if isinstance(block, DocxParagraph):
                text = " ".join(block.text.split())
                level = heading_level(block.style.name if block.style is not None else "")
                if level is not None and text:
                    flush()
                    while stack and stack[-1][0] >= level:
                        stack.pop()
                    stack.append((level, text))
                elif text:
                    buffer.append(text)
            else:
                for row in block.rows:
                    cells = [" ".join(cell.text.split()) for cell in row.cells]
                    unique = [c for i, c in enumerate(cells) if c and c not in cells[:i]]
                    if unique:
                        buffer.append(" | ".join(unique))
        flush()
        if progress is not None:
            progress(1.0, "documento lido")
        if not segments:
            raise ExtractionFailed("O documento Word não tem texto.")
        return ExtractionResult(segments=segments)


def heading_level(style_name: str) -> int | None:
    """The level of a Word heading style ("Heading 2", "Título 3"), or `None`."""
    name = style_name.strip().lower()
    for prefix in ("heading", "título", "titulo"):
        if name.startswith(prefix):
            rest = name[len(prefix) :].strip()
            return int(rest) if rest.isdigit() else 1
    return None


def _paragraphs(text: str) -> str:
    blocks = [" ".join(block.split()) for block in re.split(r"\n\s*\n", text) if block.strip()]
    return "\n\n".join(blocks)


EXTRACTORS: tuple[Extractor, ...] = (PdfExtractor(), TextExtractor(), DocxExtractor())


def extractor_for(filename: str) -> Extractor | None:
    suffix = Path(filename).suffix.lower()
    for extractor in EXTRACTORS:
        if suffix in extractor.extensions:
            return extractor
    return None
