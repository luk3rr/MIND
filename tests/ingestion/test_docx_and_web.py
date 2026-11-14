# Filename: test_docx_and_web.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import docx
import httpx
import pytest

from mind.errors import ExtractionFailed, ValidationFailed
from mind.ingestion.extractors import DocxExtractor, extractor_for, heading_level
from mind.ingestion.web import HttpPageFetcher, UrlExtractor, validate_url

ARTICLE = """<html><head><title>A célula e suas organelas</title></head><body>
<nav><a href="/">Início</a> <a href="/contato">Contato</a></nav>
<article>
<h1>A célula</h1>
<p>A célula é a unidade básica da vida e contém organelas responsáveis por funções essenciais,
como a produção de energia, a síntese de proteínas e o armazenamento da informação genética.</p>
<h2>Mitocôndrias</h2>
<p>A mitocôndria é a organela responsável pela respiração celular e produz grande parte do ATP
de que a célula precisa para realizar suas atividades, como o transporte e a divisão celular.</p>
<h2>Núcleo</h2>
<p>O núcleo guarda o material genético da célula e coordena o seu funcionamento, regulando quais
genes são expressos em cada momento e controlando a divisão celular com grande precisão.</p>
</article>
<footer>Todos os direitos reservados.</footer>
</body></html>"""


def make_docx(path: Path) -> Path:
    document = docx.Document()
    document.add_heading("Biologia", level=1)
    document.add_paragraph("A célula é a unidade da vida.")
    document.add_heading("Organelas", level=2)
    document.add_paragraph("A mitocôndria produz energia.")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Organela"
    table.cell(0, 1).text = "Função"
    table.cell(1, 0).text = "Núcleo"
    table.cell(1, 1).text = "Guarda o DNA"
    document.add_heading("Conclusão", level=1)
    document.add_paragraph("Fim do documento.")
    document.save(str(path))
    return path


def client_for(response: httpx.Response) -> httpx.Client:
    return httpx.Client(
        transport=httpx.MockTransport(lambda _request: response), follow_redirects=True
    )


# --- Word --------------------------------------------------------------------------------------


def test_docx_headings_become_sections_and_tables_become_lines(tmp_path: Path) -> None:
    result = DocxExtractor().extract(make_docx(tmp_path / "aula.docx"))
    assert [(s.section, s.text) for s in result.segments] == [
        ("Biologia", "A célula é a unidade da vida."),
        (
            "Biologia > Organelas",
            "A mitocôndria produz energia.\n\nOrganela | Função\n\nNúcleo | Guarda o DNA",
        ),
        ("Conclusão", "Fim do documento."),
    ]
    assert all(s.page is None for s in result.segments)


def test_a_corrupted_or_empty_word_file_fails_readably(tmp_path: Path) -> None:
    broken = tmp_path / "broken.docx"
    broken.write_bytes(b"this is not a zip file")
    with pytest.raises(ExtractionFailed, match="corrompido"):
        DocxExtractor().extract(broken)
    empty = tmp_path / "empty.docx"
    docx.Document().save(str(empty))
    with pytest.raises(ExtractionFailed, match="não tem texto"):
        DocxExtractor().extract(empty)


@pytest.mark.parametrize(
    ("style", "level"),
    [
        ("Heading 1", 1),
        ("Heading 3", 3),
        ("Título 2", 2),
        ("Title", None),
        ("Normal", None),
        ("Heading", 1),
    ],
)
def test_heading_levels_come_from_the_style_name(style: str, level: int | None) -> None:
    assert heading_level(style) == (None if style == "Title" else level)


def test_docx_is_routed_by_extension() -> None:
    assert extractor_for("Aula.DOCX") is not None
    assert extractor_for("aula.doc") is None


# --- URL ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "ftp://x.org/a",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://u:p@x.org/",
        "//x.org",
        "http://" + "a" * 2100,
    ],
)
def test_unsafe_or_malformed_addresses_are_refused(raw: str) -> None:
    with pytest.raises(ValidationFailed) as error:
        validate_url(raw)
    assert error.value.errors[0].field == "url"


def test_http_and_https_addresses_are_accepted_and_trimmed() -> None:
    assert validate_url("  https://exemplo.org/artigo?id=1 ") == "https://exemplo.org/artigo?id=1"
    assert validate_url("http://localhost:8000/x") == "http://localhost:8000/x"


def test_a_page_is_fetched_saved_and_its_main_text_extracted(tmp_path: Path) -> None:
    page = httpx.Response(200, text=ARTICLE, headers={"content-type": "text/html; charset=utf-8"})
    fetched = HttpPageFetcher(client_for(page)).fetch("https://exemplo.org/celula", tmp_path)

    assert fetched.path == tmp_path / "page.html"
    assert fetched.path.exists()
    result = UrlExtractor().extract(fetched.path, "https://exemplo.org/celula")

    assert result.title in {"A célula", "A célula e suas organelas"}
    text = " ".join(s.text for s in result.segments)
    assert "mitocôndria é a organela responsável" in text
    assert "Todos os direitos reservados" not in text
    sections = [s.section for s in result.segments if s.section]
    assert any("Mitocôndrias" in section for section in sections)


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(404, text="nope", headers={"content-type": "text/html"}), "HTTP 404"),
        (
            httpx.Response(200, content=b"%PDF", headers={"content-type": "application/pdf"}),
            "não é uma página de texto",
        ),
        (
            httpx.Response(
                200, text="x" * (5 * 1024 * 1024 + 10), headers={"content-type": "text/html"}
            ),
            "5 MB",
        ),
    ],
)
def test_bad_responses_are_extraction_failures_with_the_reason(
    tmp_path: Path, response: httpx.Response, message: str
) -> None:
    with pytest.raises(ExtractionFailed, match=message):
        HttpPageFetcher(client_for(response)).fetch("https://exemplo.org/x", tmp_path)


def test_network_problems_are_reported_without_a_traceback(tmp_path: Path) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    for handler, message in ((refuse, "falha de rede"), (slow, "demorou demais")):
        client = httpx.Client(transport=httpx.MockTransport(handler))
        with pytest.raises(ExtractionFailed, match=message):
            HttpPageFetcher(client).fetch("https://exemplo.org/x", tmp_path)


def test_a_page_without_readable_text_is_reported(tmp_path: Path) -> None:
    page = tmp_path / "page.html"
    page.write_text("<html><body><script>var a = 1;</script></body></html>")
    with pytest.raises(ExtractionFailed, match="JavaScript"):
        UrlExtractor().extract(page, "https://exemplo.org/")
