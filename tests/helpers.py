# Filename: helpers.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Small helpers shared by the tests."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

from mind.ingestion.web import FetchedPage


def wait_for(check: Callable[[], bool], seconds: float = 8.0) -> None:
    """Poll `check` until it is true, failing the test after `seconds`."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.05)
    raise AssertionError("condition not reached in time")


ARTICLE = (
    "<html><head><title>Fotossíntese</title></head><body><article><h1>Fotossíntese</h1>"
    "<p>A fotossíntese converte energia luminosa em energia química nos cloroplastos das "
    "plantas, das algas e de algumas bactérias, usando água e gás carbônico.</p>"
    "<h2>Etapas</h2><p>A etapa fotoquímica ocorre nos tilacoides e a fixação do carbono ocorre "
    "no estroma, no chamado ciclo de Calvin, que produz açúcares para a planta.</p>"
    "</article></body></html>"
)


class SavedPageFetcher:
    """Writes a fixed HTML page instead of using the network."""

    def __init__(self, html: str, final_url: str = "https://exemplo.org/artigo") -> None:
        self.html = html
        self.final_url = final_url
        self.requested: list[str] = []

    def fetch(self, url: str, folder: Path) -> FetchedPage:
        self.requested.append(url)
        target = folder / "page.html"
        target.write_text(self.html, encoding="utf-8")
        return FetchedPage(target, self.final_url)
