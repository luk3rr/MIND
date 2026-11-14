# Filename: test_fake_provider.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from pydantic import BaseModel

from mind.errors import ProviderError
from mind.llm.fake import FakeProvider
from mind.llm.types import Message


class Answer(BaseModel):
    text: str


class Other(BaseModel):
    number: int


MESSAGES = [Message(role="user", content="hi")]


async def test_returns_the_scripted_constant_and_records_the_call() -> None:
    provider = FakeProvider()
    provider.script(Answer, Answer(text="hello"))

    parsed, usage = await provider.complete(MESSAGES, Answer, model="m1")

    assert parsed == Answer(text="hello")
    assert usage.prompt_tokens == 10
    assert provider.calls[0].model == "m1"
    assert provider.calls[0].messages == MESSAGES


async def test_handler_receives_messages_and_model() -> None:
    provider = FakeProvider()
    provider.script(Answer, lambda messages, model: Answer(text=f"{model}:{messages[0].content}"))

    parsed, _ = await provider.complete(MESSAGES, Answer, model="m2")

    assert parsed.text == "m2:hi"


async def test_responses_are_chosen_by_schema() -> None:
    provider = FakeProvider()
    provider.script(Answer, Answer(text="a"))
    provider.script(Other, Other(number=3))

    other, _ = await provider.complete(MESSAGES, Other, model="m")

    assert other.number == 3


async def test_unscripted_schema_is_a_provider_error() -> None:
    with pytest.raises(ProviderError):
        await FakeProvider().complete(MESSAGES, Answer, model="m")


def test_fake_provider_does_not_require_consent() -> None:
    assert FakeProvider().requires_consent is False


async def test_latency_delays_the_answer() -> None:
    import time

    provider = FakeProvider(latency=0.05)
    provider.script(Answer, Answer(text="slow"))
    started = time.perf_counter()
    await provider.complete(MESSAGES, Answer, model="m")
    assert time.perf_counter() - started >= 0.05
