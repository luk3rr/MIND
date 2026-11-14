# Filename: test_theme_contrast.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re
from pathlib import Path

import pytest

CSS = Path(__file__).parents[2] / "src/mind/web/static/app.css"
MIN_CONTRAST = 4.5

LIGHT_BLOCK = re.compile(r"^:root \{(?P<body>.*?)\n\}", re.S | re.M)
DARK_MEDIA_BLOCK = re.compile(
    r':root:not\(\[data-theme="light"\]\) \{(?P<body>.*?)\n  \}', re.S | re.M
)
DARK_ATTR_BLOCK = re.compile(r'^:root\[data-theme="dark"\] \{(?P<body>.*?)\n\}', re.S | re.M)

# (text token, background token); the pairs used in the interface.
PAIRS = [
    ("--fg", "--bg"),
    ("--fg", "--surface"),
    ("--muted", "--bg"),
    ("--muted", "--surface"),
    ("--accent", "--bg"),
    ("--accent", "--surface"),
    ("--on-accent", "--accent"),
    ("--danger", "--bg"),
    ("--danger", "--surface"),
    ("--warn", "--surface"),
    ("--ok", "--bg"),
    ("--info", "--bg"),
]


def parse_tokens(body: str) -> dict[str, str]:
    return dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{6});", body))


def luminance(color: str) -> float:
    channels = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def themes() -> dict[str, dict[str, str]]:
    css = CSS.read_text(encoding="utf-8")
    light = LIGHT_BLOCK.search(css)
    dark_media = DARK_MEDIA_BLOCK.search(css)
    dark_attr = DARK_ATTR_BLOCK.search(css)
    assert light
    assert dark_media
    assert dark_attr
    return {
        "light": parse_tokens(light["body"]),
        "dark_media": parse_tokens(dark_media["body"]),
        "dark_attr": parse_tokens(dark_attr["body"]),
    }


def test_both_dark_blocks_define_the_same_tokens() -> None:
    found = themes()
    assert found["dark_media"] == found["dark_attr"]
    assert set(found["dark_attr"]) <= set(found["light"])


@pytest.mark.parametrize("theme", ["light", "dark_attr"])
@pytest.mark.parametrize(("text", "background"), PAIRS)
def test_token_pairs_meet_wcag_aa(theme: str, text: str, background: str) -> None:
    tokens = themes()[theme]
    ratio = contrast(tokens[text], tokens[background])
    assert ratio >= MIN_CONTRAST, f"{theme}: {text} on {background} = {ratio:.2f}"


def test_dark_theme_uses_the_dracula_background_and_accent() -> None:
    dark = themes()["dark_attr"]
    assert dark["--bg"] == "#282a36"
    assert dark["--accent"] == "#bd93f9"
