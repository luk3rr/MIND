# Filename: test_library_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

from fastapi.testclient import TestClient

from tests.helpers import wait_for
from tests.ingestion.pdfs import make_pdf

MARKDOWN = b"# Biologia\n\nA mitoc\xc3\xb4ndria produz energia.\n"


def new_workspace(client: TestClient) -> int:
    response = client.post("/workspaces", data={"name": "Study"})
    return int(response.headers["location"].split("/")[2])


def upload(client: TestClient, workspace_id: int, name: str, data: bytes) -> int:
    response = client.post(
        f"/w/{workspace_id}/library/import",
        files={"file": (name, data, "application/octet-stream")},
    )
    return int(response.status_code)


def test_empty_library_shows_the_empty_message_and_the_form(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    page = client.get(f"/w/{workspace_id}/library")
    assert page.status_code == 200
    assert "Nenhum material ainda" in page.text
    assert 'enctype="multipart/form-data"' in page.text


def test_markdown_upload_is_listed_and_becomes_indexed(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    assert upload(client, workspace_id, "notes.md", MARKDOWN) == 303

    rows = f"/w/{workspace_id}/library/rows"
    wait_for(lambda: "Indexado" in client.get(rows).text)
    page = client.get(f"/w/{workspace_id}/library").text
    assert "notes" in page
    assert "Texto" in page
    assert 'hx-trigger="every 2s"' not in client.get(rows).text


def test_rows_poll_while_a_material_is_still_importing(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    big = b"palavra " * 400_000
    upload(client, workspace_id, "big.txt", big)
    first = client.get(f"/w/{workspace_id}/library/rows").text
    assert "notes" not in first
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text, 20)


def test_pdf_upload_shows_pages_and_a_text_preview_with_page_numbers(
    client: TestClient, tmp_path: Path
) -> None:
    workspace_id = new_workspace(client)
    pdf = make_pdf(tmp_path / "aula.pdf", ["Texto da página um.", "Texto da página dois."])
    assert upload(client, workspace_id, "aula.pdf", pdf.read_bytes()) == 303
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text)

    preview = client.get(f"/w/{workspace_id}/library/1")
    assert preview.status_code == 200
    assert "Texto da página um" in preview.text
    assert "Página 2" in preview.text
    assert "Voltar à Biblioteca" in preview.text


def test_failed_import_shows_the_reason(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    upload(client, workspace_id, "bad.pdf", b"not a pdf")
    wait_for(lambda: "Falhou" in client.get(f"/w/{workspace_id}/library/rows").text)
    assert "corrompido" in client.get(f"/w/{workspace_id}/library/rows").text


def test_unsupported_format_rerenders_the_page_with_an_alert(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    response = client.post(
        f"/w/{workspace_id}/library/import",
        files={"file": ("slides.pptx", b"x", "application/octet-stream")},
    )
    assert response.status_code == 415
    assert 'role="alert"' in response.text
    assert "não suportado" in response.text


def test_delete_removes_the_material(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    upload(client, workspace_id, "notes.md", MARKDOWN)
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text)

    response = client.post(f"/w/{workspace_id}/library/1/delete")
    assert response.status_code == 303
    assert "notes" not in client.get(f"/w/{workspace_id}/library/rows").text
    assert client.get(f"/w/{workspace_id}/library/1").status_code == 404


def test_unknown_workspace_and_material_return_404(client: TestClient) -> None:
    assert client.get("/w/99/library").status_code == 404
    workspace_id = new_workspace(client)
    assert client.get(f"/w/{workspace_id}/library/5").status_code == 404
    assert client.post(f"/w/{workspace_id}/library/5/delete").status_code == 404


def test_preview_paginates_long_materials(client: TestClient) -> None:
    workspace_id = new_workspace(client)
    paragraphs = "\n\n".join(f"Parágrafo {i} " + "texto " * 150 for i in range(60))
    upload(client, workspace_id, "long.txt", paragraphs.encode())
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text)

    first = client.get(f"/w/{workspace_id}/library/1").text
    assert "Próximos trechos" in first
    assert "Trechos anteriores" not in first
    second = client.get(f"/w/{workspace_id}/library/1?offset=20").text
    assert "Trechos anteriores" in second
