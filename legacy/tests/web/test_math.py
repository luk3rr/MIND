# Filename: test_math.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from mind.web.math import render_math

MATH_JS = Path(__file__).parents[2] / "src/mind/web/static/math.js"


def test_render_math_keeps_delimiters_and_escapes_html() -> None:
    html = str(render_math("Energy $E=mc^2$ and <script>alert(1)</script>"))
    assert "data-math" in html
    assert "$E=mc^2$" in html
    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def run_split(text: str) -> list[dict[str, str]]:
    script = (
        f"const {{splitMath}} = require({json.dumps(str(MATH_JS))});"
        f"console.log(JSON.stringify(splitMath({json.dumps(text)})));"
    )
    node = shutil.which("node")
    assert node is not None
    result = subprocess.run(  # noqa: S603
        [node, "-e", script], capture_output=True, text=True, check=True
    )
    parsed: list[dict[str, str]] = json.loads(result.stdout)
    return parsed


needs_node = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")


@needs_node
def test_split_inline_and_display_formulas() -> None:
    parts = run_split("a $x^2$ b $$\\frac{1}{2}$$ c")
    assert [(p["type"], p["value"]) for p in parts] == [
        ("text", "a "),
        ("inline", "x^2"),
        ("text", " b "),
        ("display", "\\frac{1}{2}"),
        ("text", " c"),
    ]


@needs_node
def test_currency_amounts_are_not_treated_as_formulas() -> None:
    parts = run_split("It costs $5 and then $10 more")
    assert [p["type"] for p in parts] == ["text"]


@needs_node
def test_single_character_formula_and_plain_text() -> None:
    assert [p["type"] for p in run_split("value $x$ here")] == ["text", "inline", "text"]
    assert [p["type"] for p in run_split("no math")] == ["text"]
