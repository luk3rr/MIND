# Filename: web.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Importing a web page: validate the address, fetch it politely and extract the main text."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

import httpx
import trafilatura

from mind.errors import ExtractionFailed, FieldError, ValidationFailed
from mind.ingestion.extractors import (
    CancelCheck,
    ExtractionResult,
    ProgressCallback,
    markdown_segments,
)

MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_SECONDS = 20.0
MAX_REDIRECTS = 5
MAX_URL_LENGTH = 2048
ALLOWED_TYPES = ("text/html", "application/xhtml+xml", "text/plain")
USER_AGENT = "MIND/0.1 (local study tool; user-initiated import)"
PAGE_NAME = "page.html"


def validate_url(raw: str) -> str:
    """Accept only plain http(s) addresses without embedded credentials."""
    url = raw.strip()
    problem: str | None = None
    parts = urlsplit(url)
    if not url or len(url) > MAX_URL_LENGTH:
        problem = "Informe o endereço da página."
    elif parts.scheme not in ("http", "https") or not parts.netloc:
        problem = "Use um endereço que comece com http:// ou https://."
    elif parts.username or parts.password:
        problem = "O endereço não pode conter usuário e senha."
    if problem is not None:
        raise ValidationFailed(problem, errors=[FieldError("url", problem)])
    return url


@dataclass(frozen=True)
class FetchedPage:
    path: Path
    final_url: str


class PageFetcher(Protocol):
    def fetch(self, url: str, folder: Path) -> FetchedPage: ...


class HttpPageFetcher:
    def __init__(self, client: httpx.Client | None = None) -> None:
        self._client = client

    def fetch(self, url: str, folder: Path) -> FetchedPage:
        client = self._client or httpx.Client(
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
            timeout=TIMEOUT_SECONDS,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,text/plain",
            },
        )
        target = folder / PAGE_NAME
        try:
            with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    raise ExtractionFailed(f"A página respondeu HTTP {response.status_code}.")
                kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if kind not in ALLOWED_TYPES:
                    raise ExtractionFailed(
                        f"O endereço não é uma página de texto (tipo '{kind or 'desconhecido'}')."
                    )
                size = 0
                with target.open("wb") as handle:
                    for block in response.iter_bytes():
                        size += len(block)
                        if size > MAX_BYTES:
                            raise ExtractionFailed("A página passa do limite de 5 MB.")
                        handle.write(block)
                final_url = str(response.url)
        except httpx.TooManyRedirects as exc:
            raise ExtractionFailed("A página redireciona vezes demais.") from exc
        except httpx.TimeoutException as exc:
            raise ExtractionFailed("A página demorou demais para responder.") from exc
        except httpx.HTTPError as exc:
            raise ExtractionFailed("Não foi possível baixar a página (falha de rede).") from exc
        finally:
            if self._client is None:
                client.close()
        return FetchedPage(target, final_url)


class UrlExtractor:
    """Extracts the main text of a saved HTML page as Markdown, split by headings."""

    kind = "url"

    def extract(
        self,
        path: Path,
        url: str | None = None,
        progress: ProgressCallback | None = None,
        check_cancelled: CancelCheck | None = None,
    ) -> ExtractionResult:
        html = path.read_bytes()
        markdown = trafilatura.extract(
            html,
            url=url,
            output_format="markdown",
            include_tables=True,
            include_comments=False,
            favor_recall=True,
        )
        if not markdown or not markdown.strip():
            raise ExtractionFailed(
                "Não foi possível extrair o texto principal da página "
                "(ela pode depender de JavaScript)."
            )
        metadata = trafilatura.extract_metadata(html)
        if progress is not None:
            progress(1.0, "página lida")
        segments = markdown_segments(markdown)
        if not segments:
            raise ExtractionFailed("A página não tem texto.")
        return ExtractionResult(segments=segments, title=(metadata.title if metadata else None))
