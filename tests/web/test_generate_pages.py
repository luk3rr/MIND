# Filename: test_generate_pages.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.helpers import wait_for

TEXT = (
    "# Célula\n\n" + "A mitocôndria produz energia para a célula e participa da respiração. " * 30
)


def prepare(client: TestClient) -> int:
    response = client.post("/workspaces", data={"name": "Study"})
    workspace_id = int(response.headers["location"].split("/")[2])
    client.post(
        f"/w/{workspace_id}/library/import",
        files={"file": ("aula.md", TEXT.encode(), "text/markdown")},
    )
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text)
    return workspace_id


def generate(client: TestClient, workspace_id: int, **form: str) -> int:
    data = {"material_id": "1", "subtype": "qa", "quantity": "5", **form}
    response = client.post(f"/w/{workspace_id}/generate", data=data)
    assert response.status_code == 303
    wait_for(lambda: "Concluída" in client.get(f"/w/{workspace_id}/generate/runs").text)
    return 1


def test_page_without_materials_explains_what_to_do(ready: TestClient) -> None:
    response = ready.post("/workspaces", data={"name": "Empty"})
    workspace_id = response.headers["location"].split("/")[2]
    page = ready.get(f"/w/{workspace_id}/generate")
    assert page.status_code == 200
    assert "Importe e aguarde" in page.text
    assert "Nenhuma geração ainda" in page.text


def test_form_lists_indexed_materials_and_the_four_card_types(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    page = ready.get(f"/w/{workspace_id}/generate").text
    assert "aula" in page
    for label in (
        "Pergunta e resposta",
        "Lacuna (cloze)",
        "Comparativo (X vs Y)",
        "Verdadeiro ou falso",
    ):
        assert label in page
    assert "disabled" not in page.split('<button class="btn" type="submit"')[1][:40]


def test_estimate_fragment_shows_cost_or_that_it_is_unavailable(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    fragment = ready.post(
        f"/w/{workspace_id}/generate/estimate",
        data={"material_id": "1", "subtype": "qa", "quantity": "20"},
    ).text
    assert "Custo estimado" in fragment
    assert "indisponível" in fragment
    assert "lote(s)" in fragment

    invalid = ready.post(
        f"/w/{workspace_id}/generate/estimate",
        data={"material_id": "1", "subtype": "qa", "quantity": "99"},
    ).text
    assert "alert-danger" in invalid


def test_a_run_completes_and_offers_the_review_link(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    generate(ready, workspace_id)
    runs = ready.get(f"/w/{workspace_id}/generate/runs").text
    assert "5 / 5" in runs
    assert "Revisar (5)" in runs
    assert 'hx-trigger="every 2s"' not in runs


def test_invalid_request_rerenders_the_form_with_an_alert(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    response = ready.post(
        f"/w/{workspace_id}/generate",
        data={"material_id": "1", "subtype": "qa", "quantity": "0"},
    )
    assert response.status_code == 422
    assert 'role="alert"' in response.text


def test_without_key_or_consent_generation_is_blocked_with_the_reason(client: TestClient) -> None:
    response = client.post("/workspaces", data={"name": "Study"})
    workspace_id = response.headers["location"].split("/")[2]
    client.post(
        f"/w/{workspace_id}/library/import", files={"file": ("a.md", TEXT.encode(), "text/plain")}
    )
    wait_for(lambda: "Indexado" in client.get(f"/w/{workspace_id}/library/rows").text)

    page = client.get(f"/w/{workspace_id}/generate").text
    assert "A geração está indisponível" in page
    assert "Chave de API não configurada" in page or "chave do OpenRouter" in page
    assert "disabled" in page

    blocked = client.post(
        f"/w/{workspace_id}/generate", data={"material_id": "1", "subtype": "qa", "quantity": "5"}
    )
    assert blocked.status_code == 409


def test_cancel_redirects_back_and_unknown_runs_are_404(ready: TestClient) -> None:
    workspace_id = prepare(ready)
    generate(ready, workspace_id)
    assert ready.post(f"/w/{workspace_id}/generate/1/cancel").status_code == 303
    assert ready.post(f"/w/{workspace_id}/generate/99/cancel").status_code == 404
