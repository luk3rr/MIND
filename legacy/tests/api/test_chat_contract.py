# Filename: test_chat_contract.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from fastapi.testclient import TestClient

from tests.api.test_generations_contract import prepare


def test_a_question_returns_a_cited_answer_and_is_listed(ready: TestClient) -> None:
    base = prepare(ready)
    reply = ready.post(f"{base}/chat", json={"question": "O que a mitocôndria produz?"})
    assert reply.status_code == 200
    body = reply.json()
    assert (body["supported"], body["answer"]) == (True, "Resposta baseada no material.")
    [citation] = body["citations"]
    assert (citation["material_title"], citation["material_id"]) == ("aula", 1)
    assert citation["quote"].startswith("A mitocôndria produz energia")

    [listed] = ready.get(f"{base}/chat/messages").json()
    assert listed["id"] == body["id"]
    assert ready.delete(f"{base}/chat/messages").status_code == 204
    assert ready.get(f"{base}/chat/messages").json() == []


def test_a_question_without_support_is_a_refusal_with_no_citations(ready: TestClient) -> None:
    base = prepare(ready)
    body = ready.post(f"{base}/chat", json={"question": "Xilofone zeppelin?"}).json()
    assert (body["supported"], body["citations"]) == (False, [])
    assert body["answer"].startswith("Não encontrei suporte")


def test_chat_errors_are_problem_documents(ready: TestClient) -> None:
    base = prepare(ready)
    invalid = ready.post(f"{base}/chat", json={"question": "  "})
    assert (invalid.status_code, invalid.json()["code"]) == (422, "VALIDATION_ERROR")
    assert ready.post("/api/v1/workspaces/77/chat", json={"question": "x"}).status_code == 404
    assert ready.get("/api/v1/workspaces/77/chat/messages").status_code == 404


def test_without_an_api_key_the_model_call_is_refused_up_front(client: TestClient) -> None:
    base = prepare(client)
    refused = client.post(f"{base}/chat", json={"question": "mitocôndria energia"})
    assert (refused.status_code, refused.json()["code"]) == (409, "PROVIDER_KEY_MISSING")


def test_embeddings_are_unavailable_without_the_extra(ready: TestClient) -> None:
    base = prepare(ready)
    status = ready.get(f"{base}/embeddings/status").json()
    assert (status["available"], status["enabled"]) == (False, False)
    assert status["total"] > 0
    refused = ready.post(f"{base}/embeddings/enable")
    assert (refused.status_code, refused.json()["code"]) == (409, "EMBEDDINGS_UNAVAILABLE")
    off = ready.post(f"{base}/embeddings/disable").json()
    assert off["enabled"] is False
