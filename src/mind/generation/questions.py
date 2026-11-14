# Filename: questions.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Question generation for one batch: generate, check the source, judge, store drafts."""

from __future__ import annotations

import json
import string
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Item, Topic
from mind.generation.cards import BatchOutcome, clean_topic
from mind.generation.judge import Judge
from mind.generation.planning import SourceChunk
from mind.generation.prompts import JudgeItem, PromptChunk, build_question_messages
from mind.generation.schemas import PROFILES, OptionOut, QuestionBatch, QuestionOut, QuestionPayload
from mind.generation.topics import upsert_topic
from mind.llm.guarded import GuardedProvider
from mind.verification.source_checker import SourceChecker, normalize

CERTO_ERRADO_OPTIONS = [
    OptionOut(key="C", text="Certo", why=""),
    OptionOut(key="E", text="Errado", why=""),
]


def question_problem(question: QuestionOut, profile: str) -> str | None:
    """Why a generated question is malformed for its profile, or `None` when it is fine."""
    wanted = PROFILES[profile]
    if question.subtype != wanted.subtype:
        return "wrong_subtype"
    if not question.statement.strip():
        return "empty_statement"
    if not question.explanation.strip():
        return "empty_explanation"
    if wanted.subtype == "certo_errado":
        return None if question.answer in ("C", "E") else "bad_answer"
    options = question.options
    if len(options) != wanted.options:
        return "wrong_option_count"
    if [o.key for o in options] != list(string.ascii_uppercase[: wanted.options]):
        return "bad_option_keys"
    if any(not o.text.strip() or not o.why.strip() for o in options):
        return "empty_option"
    if len({normalize(o.text)[0] for o in options}) != len(options):
        return "duplicate_options"
    return None if question.answer in {o.key for o in options} else "bad_answer"


def payload_for(question: QuestionOut) -> QuestionPayload:
    options = (
        CERTO_ERRADO_OPTIONS
        if question.subtype == "certo_errado"
        else [
            OptionOut(key=o.key, text=o.text.strip(), why=o.why.strip()) for o in question.options
        ]
    )
    return QuestionPayload(
        statement=question.statement.strip(),
        options=options,
        answer=question.answer,
        explanation=question.explanation.strip(),
    )


@dataclass
class _Candidate:
    question: QuestionOut
    chunk: SourceChunk


class QuestionGenerator:
    def __init__(
        self,
        sessions: sessionmaker[Session],
        provider: GuardedProvider,
        checker: SourceChecker | None = None,
    ) -> None:
        self._sessions = sessions
        self._provider = provider
        self._checker = checker or SourceChecker()
        self._judge = Judge(provider)

    async def generate_batch(
        self,
        *,
        run_id: int,
        profile: str,
        count: int,
        chunks: list[SourceChunk],
        model: str,
        judge_model: str,
        remaining: Callable[[], int],
    ) -> BatchOutcome:
        prompt_chunks = [PromptChunk(c.id, c.label, c.text) for c in chunks]
        batch, usage = await self._provider.complete(
            build_question_messages(profile, count, prompt_chunks),
            QuestionBatch,
            model=model,
            purpose="generation",
        )
        outcome = BatchOutcome(cost_usd=usage.cost_usd or 0.0)
        candidates = self._screen(profile, batch.questions, {c.id: c for c in chunks}, outcome)
        if candidates:
            items = [
                JudgeItem(
                    excerpt=c.chunk.text,
                    statement=c.question.statement,
                    options=[(o.key, o.text) for o in c.question.options],
                    answer=c.question.answer,
                )
                for c in candidates
            ]
            verdict = await self._judge.judge(items, judge_model)
            outcome.cost_usd += verdict.cost_usd
            kept: list[_Candidate] = []
            for candidate, ok, reason in zip(
                candidates, verdict.supported, verdict.reasons, strict=True
            ):
                if ok:
                    kept.append(candidate)
                else:
                    outcome.unsupported += 1
                    outcome.note(f"unsupported: {reason}", candidate.question.statement)
            candidates = kept
        # No `await` below: duplicates are re-checked and the drafts stored atomically.
        self._store(run_id, profile, candidates, remaining(), outcome)
        return outcome

    def _screen(
        self,
        profile: str,
        questions: list[QuestionOut],
        by_id: dict[int, SourceChunk],
        outcome: BatchOutcome,
    ) -> list[_Candidate]:
        with self._sessions() as session:
            seen = self._existing_statements(session)
        found: list[_Candidate] = []
        for question in questions:
            problem = question_problem(question, profile)
            if problem is not None:
                outcome.invalid += 1
                outcome.note(problem, question.statement)
                continue
            chunk = by_id.get(question.source.chunk_id)
            if chunk is None:
                outcome.no_source += 1
                outcome.note("chunk_not_in_batch", question.statement)
                continue
            check = self._checker.check(question.source.quote, chunk.text)
            if not check.valid:
                outcome.no_source += 1
                outcome.note(check.reason or "invalid_source", question.statement)
                continue
            key = normalize(question.statement)[0]
            if key in seen:
                outcome.duplicate += 1
                outcome.note("duplicate", question.statement)
                continue
            seen.add(key)
            found.append(_Candidate(question, chunk))
        return found

    def _store(
        self,
        run_id: int,
        profile: str,
        candidates: list[_Candidate],
        remaining: int,
        outcome: BatchOutcome,
    ) -> None:
        with self._sessions() as session:
            seen = self._existing_statements(session)
            topics: dict[str, Topic] = {
                t.name.casefold(): t for t in session.scalars(select(Topic))
            }
            for candidate in candidates:
                if outcome.accepted >= remaining:
                    break
                question = candidate.question
                key = normalize(question.statement)[0]
                if key in seen:
                    outcome.duplicate += 1
                    outcome.note("duplicate", question.statement)
                    continue
                seen.add(key)
                topic = upsert_topic(session, topics, clean_topic(question.topic))
                session.add(
                    Item(
                        run_id=run_id,
                        kind="question",
                        subtype=question.subtype,
                        payload_json=json.dumps(
                            payload_for(question).model_dump(), ensure_ascii=False
                        ),
                        status="draft",
                        topic_id=topic.id if topic else None,
                        chunk_id=candidate.chunk.id,
                        source_title=candidate.chunk.material_title,
                        source_page=candidate.chunk.page,
                        quote=question.source.quote.strip(),
                    )
                )
                outcome.accepted += 1
            session.commit()

    @staticmethod
    def _existing_statements(session: Session) -> set[str]:
        rows = session.scalars(
            select(Item.payload_json).where(Item.kind == "question", Item.status != "discarded")
        )
        return {normalize(str(json.loads(p).get("statement", "")))[0] for p in rows}
