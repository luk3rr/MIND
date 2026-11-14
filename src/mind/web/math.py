# Filename: math.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Support for rendering LaTeX formulas (KaTeX runs in the browser)."""

from __future__ import annotations

from markupsafe import Markup, escape


def render_math(text: str) -> Markup:
    """Return the escaped text inside an element marked for KaTeX.

    The `$...$` and `$$...$$` delimiters are preserved; the browser script turns the
    segments into formulas and, if a formula is invalid, keeps the raw text.
    """
    return Markup('<span class="math-text" data-math>{}</span>').format(escape(text))
