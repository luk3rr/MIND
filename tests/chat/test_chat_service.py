# Filename: test_chat_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest

from mind.chat.schemas import ChatAnswer, ChatCitation
from mind.chat.service import NO_SUPPORT
from mind.errors import ValidationFailed
from mind.llm.types import Usage
from tests.chat.conftest import MITOCHONDRIA, ChatRig


def script(rig: ChatRig, answer: ChatAnswer) -> None:
    rig.fake.script(ChatAnswer, answer)


async def test_a_supported_answer_keeps_only_verified_citations(chat_rig: ChatRig) -> None:
    mitochondria = chat_rig.chunk_ids[0]
    chat_rig.fake.usage = Usage(prompt_tokens=10, completion_tokens=5, cost_usd=0.01)
    script(
        chat_rig,
        ChatAnswer(
            supported=True,
            answer="A mitocôndria produz energia.",
            citations=[
                ChatCitation(chunk_id=mitochondria, quote="produz a maior parte da energia"),
                ChatCitation(chunk_id=mitochondria, quote="texto inventado que não existe"),
                ChatCitation(chunk_id=999, quote="produz a maior parte da energia"),
                ChatCitation(chunk_id=mitochondria, quote="produz a maior parte da energia"),
            ],
        ),
    )
    reply = await chat_rig.chat.ask("  O que a mitocôndria faz? ")
    assert reply.supported
    assert reply.question == "O que a mitocôndria faz?"
    [citation] = reply.citations
    assert (citation.material_title, citation.page) == ("Aula", 3)
    assert citation.quote == "produz a maior parte da energia"
    assert reply.cost_usd == 0.01
    sent = chat_rig.fake.calls[0]
    assert sent.model == chat_rig.services.settings.get().generation_model
    assert MITOCHONDRIA in sent.messages[1].content
    assert "Question: O que a mitocôndria faz?" in sent.messages[1].content


async def test_without_retrieved_excerpts_the_model_is_not_called(chat_rig: ChatRig) -> None:
    reply = await chat_rig.chat.ask("Xilofone zeppelin?")
    assert (reply.answer, reply.supported, reply.citations) == (NO_SUPPORT, False, [])
    assert chat_rig.fake.calls == []


@pytest.mark.parametrize(
    "answer",
    [
        ChatAnswer(supported=False, answer="Não sei.", citations=[]),
        ChatAnswer(supported=True, answer="Resposta sem fonte.", citations=[]),
        ChatAnswer(
            supported=True,
            answer="Resposta com citação falsa.",
            citations=[ChatCitation(chunk_id=1, quote="isto não aparece em lugar nenhum")],
        ),
    ],
)
async def test_an_unsupported_or_uncited_answer_becomes_the_refusal(
    chat_rig: ChatRig, answer: ChatAnswer
) -> None:
    script(chat_rig, answer)
    reply = await chat_rig.chat.ask("O que a mitocôndria faz?")
    assert (reply.answer, reply.supported, reply.citations) == (NO_SUPPORT, False, [])
    assert len(chat_rig.fake.calls) == 1


async def test_questions_are_validated_and_messages_are_persisted(chat_rig: ChatRig) -> None:
    with pytest.raises(ValidationFailed):
        await chat_rig.chat.ask("   ")
    with pytest.raises(ValidationFailed):
        await chat_rig.chat.ask("x" * 1001)

    script(
        chat_rig,
        ChatAnswer(
            supported=True,
            answer="Guarda o material genético.",
            citations=[ChatCitation(chunk_id=chat_rig.chunk_ids[1], quote="guarda o material gen")],
        ),
    )
    await chat_rig.chat.ask("O que o núcleo guarda?")
    await chat_rig.chat.ask("Xilofone zeppelin?")
    history = chat_rig.chat.history()
    assert [m.question for m in history] == ["O que o núcleo guarda?", "Xilofone zeppelin?"]
    assert history[0].citations[0].page == 4
    assert chat_rig.chat.clear() == 2
    assert chat_rig.chat.history() == []
