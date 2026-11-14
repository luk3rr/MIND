# Filename: pdfs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Helpers that build small PDFs for the tests (no binary fixtures in the repository)."""

from __future__ import annotations

from pathlib import Path

import pymupdf

PAGE_RECT = pymupdf.Rect(50, 50, 545, 790)


def make_pdf(path: Path, pages: list[str], *, fontsize: float = 11) -> Path:
    """Write a PDF with one page per string (an empty string makes a blank page)."""
    document = pymupdf.open()
    for text in pages:
        page = document.new_page()
        if text:
            remaining = page.insert_textbox(PAGE_RECT, text, fontsize=fontsize, fontname="helv")
            assert remaining >= 0, "test text does not fit on the page"
    document.save(path)
    document.close()
    return path


def make_locked_pdf(source: Path, target: Path) -> Path:
    """Copy `source` into a password-protected PDF."""
    document = pymupdf.open(source)
    document.save(
        target,
        encryption=getattr(pymupdf, "PDF_ENCRYPT_AES_256"),  # noqa: B009
        owner_pw="owner",
        user_pw="user",
    )
    document.close()
    return target
