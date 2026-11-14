# Filename: test_a11y_basics.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import re
from pathlib import Path

from fastapi.testclient import TestClient

TEMPLATES = Path(__file__).parents[2] / "src/mind/web/templates"


def create_workspace(client: TestClient) -> int:
    response = client.post("/workspaces", data={"name": "Biology"})
    return int(response.headers["location"].split("/")[2])


def test_page_structure_supports_keyboard_and_screen_readers(client: TestClient) -> None:
    workspace_id = create_workspace(client)
    page = client.get(f"/w/{workspace_id}/today").text
    assert '<html lang="pt-BR">' in page
    assert 'class="skip-link" href="#main"' in page
    assert '<main id="main"' in page
    assert "<nav aria-label=" in page
    assert 'aria-label="Alternar tema claro/escuro"' in page


def test_templates_have_no_hardcoded_visible_text() -> None:
    """Visible text must come from `strings.py` (NFR-13), not from the templates."""
    for template in TEMPLATES.glob("*.html"):
        text = template.read_text(encoding="utf-8")
        text = re.sub(r"\{#.*?#\}|\{\{.*?\}\}|\{%.*?%\}", " ", text, flags=re.S)
        text = re.sub(r"<(script|style)\b.*?</\1>", " ", text, flags=re.S)
        text = re.sub(r"<[^>]*>", " ", text)
        letters = re.findall(r"[A-Za-zÀ-ÿ]+", text)
        assert not letters, f"{template.name} has hardcoded text: {letters}"


def test_templates_and_styles_do_not_reference_external_urls() -> None:
    root = TEMPLATES.parent
    files = [*TEMPLATES.glob("*.html"), root / "static/app.css", root / "static/theme.js"]
    files.append(root / "static/math.js")
    for file in files:
        assert not re.search(r"https?://", file.read_text(encoding="utf-8")), file.name
