# Filename: judge.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The judge: a second model that checks each question's answer against its source."""

from __future__ import annotations

from dataclasses import dataclass

from mind.generation.prompts import JudgeItem, build_judge_messages
from mind.generation.schemas import JudgeBatch
from mind.llm.guarded import GuardedProvider


@dataclass(frozen=True)
class JudgeResult:
    supported: list[bool]
    reasons: list[str]
    cost_usd: float


class Judge:
    def __init__(self, provider: GuardedProvider) -> None:
        self._provider = provider

    async def judge(self, items: list[JudgeItem], model: str) -> JudgeResult:
        """One verdict per item. A missing, repeated or out-of-range verdict counts against it."""
        if not items:
            return JudgeResult([], [], 0.0)
        batch, usage = await self._provider.complete(
            build_judge_messages(items), JudgeBatch, model=model, purpose="judge"
        )
        supported = [False] * len(items)
        reasons = ["no_verdict"] * len(items)
        seen: set[int] = set()
        for verdict in batch.verdicts:
            if not 0 <= verdict.index < len(items) or verdict.index in seen:
                continue
            seen.add(verdict.index)
            supported[verdict.index] = verdict.supported
            reasons[verdict.index] = verdict.reason or (
                "supported" if verdict.supported else "unsupported"
            )
        return JudgeResult(supported, reasons, usage.cost_usd or 0.0)
