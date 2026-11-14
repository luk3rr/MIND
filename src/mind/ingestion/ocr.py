# Filename: ocr.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Optical character recognition through the Tesseract executable."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from mind.errors import ExtractionFailed

TIMEOUT_SECONDS = 180
INSTALL_HINT = "Instale o Tesseract (ex.: sudo apt install tesseract-ocr tesseract-ocr-por)."


@dataclass(frozen=True)
class OcrPage:
    text: str
    confidence: float  # 0.0 to 1.0, the mean confidence of the recognized words


class OcrEngine(Protocol):
    def available(self) -> bool: ...

    def recognize(self, png: bytes) -> OcrPage: ...


def parse_tsv(tsv: str) -> OcrPage:
    """Rebuild the text (lines and paragraphs) and the mean word confidence from Tesseract TSV."""
    lines: dict[tuple[int, int, int], list[str]] = {}
    confidences: list[float] = []
    for row in tsv.splitlines()[1:]:
        cells = row.split("\t")
        if len(cells) < 12 or not cells[11].strip():
            continue
        try:
            confidence = float(cells[10])
            key = (int(cells[2]), int(cells[3]), int(cells[4]))
        except ValueError:
            continue
        if confidence < 0:
            continue
        confidences.append(confidence)
        lines.setdefault(key, []).append(cells[11].strip())
    text_lines: list[str] = []
    previous: tuple[int, int] | None = None
    for (block, paragraph, _line), words in lines.items():
        if previous is not None and previous != (block, paragraph):
            text_lines.append("")
        text_lines.append(" ".join(words))
        previous = (block, paragraph)
    mean = sum(confidences) / len(confidences) / 100 if confidences else 0.0
    return OcrPage(text="\n".join(text_lines), confidence=mean)


class TesseractEngine:
    def __init__(self, languages: str = "por+eng", executable: str = "tesseract") -> None:
        self._wanted = [lang for lang in languages.split("+") if lang]
        self._executable = executable
        self._languages: str | None = None
        self._checked = False

    def _resolve(self) -> str | None:
        """The wanted languages that are installed, joined for `-l`; `None` if unusable."""
        if self._checked:
            return self._languages
        self._checked = True
        path = shutil.which(self._executable)
        if path is None:
            return None
        try:
            listing = subprocess.run(  # noqa: S603
                [path, "--list-langs"], capture_output=True, text=True, timeout=20, check=True
            )
        except (OSError, subprocess.SubprocessError):
            return None
        installed = {line.strip() for line in listing.stdout.splitlines()[1:] if line.strip()}
        usable = [lang for lang in self._wanted if lang in installed] or (
            ["eng"] if "eng" in installed else sorted(installed - {"osd"})[:1]
        )
        self._languages = "+".join(usable) if usable else None
        return self._languages

    def available(self) -> bool:
        return self._resolve() is not None

    def recognize(self, png: bytes) -> OcrPage:
        languages = self._resolve()
        executable = shutil.which(self._executable)
        if languages is None or executable is None:
            raise ExtractionFailed(f"O Tesseract não está disponível. {INSTALL_HINT}")
        with tempfile.TemporaryDirectory(prefix="mind-ocr-") as folder:
            image = Path(folder) / "page.png"
            image.write_bytes(png)
            try:
                done = subprocess.run(  # noqa: S603
                    [executable, str(image), "stdout", "-l", languages, "--psm", "3", "tsv"],
                    capture_output=True,
                    text=True,
                    timeout=TIMEOUT_SECONDS,
                    check=True,
                )
            except subprocess.TimeoutExpired as exc:
                raise ExtractionFailed("O OCR demorou demais em uma página.") from exc
            except (OSError, subprocess.CalledProcessError) as exc:
                raise ExtractionFailed("O Tesseract falhou ao ler uma página.") from exc
        return parse_tsv(done.stdout)
