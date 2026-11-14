# Filename: cards.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Card generation for one batch: ask the model, validate every card, store the drafts."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Item, Topic
from mind.generation.planning import SourceChunk
from mind.generation.prompts import PromptChunk, build_card_messages
from mind.generation.schemas import CardBatch, CardOut, CardPayload
from mind.generation.topics import upsert_topic
from mind.llm.guarded import GuardedProvider
from mind.verification.source_checker import SourceChecker, normalize

CLOZE_GAP = re.compile(r"\{\{c\d+::.+?\}\}", re.S)
TRUE_FALSE_BACK = re.compile(r"^\s*(verdadeiro|falso)\b", re.I)
MAX_TOPIC_CHARS = 80
LOG_LIMIT = 20


@dataclass
class BatchOutcome:
    accepted: int = 0
    no_source: int = 0
    invalid: int = 0
    duplicate: int = 0
    cost_usd: float = 0.0
    unsupported: int = 0
    log: list[dict[str, str]] = field(default_factory=list)

    def discard(self, reason: str, card: CardOut) -> None:
        self.note(reason, card.front)

    def note(self, reason: str, text: str) -> None:
        if len(self.log) < LOG_LIMIT:
            self.log.append({"reason": reason, "front": text[:80]})


def clean_topic(raw: str | None) -> str | None:
    if raw is None:
        return None
    topic = " ".join(raw.split())[:MAX_TOPIC_CHARS]
    return topic or None


def payload_problem(subtype: str, front: str, back: str) -> str | None:
    """Return why a card's text is malformed for its type, or `None` when it is fine."""
    if not front.strip():
        return "empty_front"
    if subtype != "cloze" and not back.strip():
        return "empty_back"
    if subtype == "cloze" and not CLOZE_GAP.search(front):
        return "cloze_without_gap"
    if subtype == "true_false" and not TRUE_FALSE_BACK.match(back):
        return "true_false_without_verdict"
    return None


def card_problem(card: CardOut, subtype: str) -> str | None:
    """Return why a generated card is malformed, or `None` when its shape is fine."""
    if card.subtype != subtype:
        return "wrong_subtype"
    return payload_problem(subtype, card.front, card.back)


class CardGenerator:
    def __init__(
        self,
        sessions: sessionmaker[Session],
        provider: GuardedProvider,
        checker: SourceChecker | None = None,
    ) -> None:
        self._sessions = sessions
        self._provider = provider
        self._checker = checker or SourceChecker()

    async def generate_batch(
        self,
        *,
        run_id: int,
        subtype: str,
        count: int,
        chunks: list[SourceChunk],
        model: str,
        remaining: Callable[[], int],
        topic_id: int | None = None,
        avoid: list[str] | None = None,
    ) -> BatchOutcome:
        """Ask for `count` cards, then store as many valid drafts as `remaining()` still allows."""
        prompt_chunks = [PromptChunk(c.id, c.label, c.text) for c in chunks]
        messages = build_card_messages(subtype, count, prompt_chunks, avoid)
        batch, usage = await self._provider.complete(
            messages, CardBatch, model=model, purpose="generation"
        )
        outcome = BatchOutcome(cost_usd=usage.cost_usd or 0.0)
        # No `await` below: validation and storage run atomically with respect to other batches.
        self._store(
            run_id, subtype, batch.cards, {c.id: c for c in chunks}, remaining(), outcome, topic_id
        )
        return outcome

    def _store(
        self,
        run_id: int,
        subtype: str,
        cards: list[CardOut],
        by_id: dict[int, SourceChunk],
        remaining: int,
        outcome: BatchOutcome,
        forced_topic: int | None = None,
    ) -> None:
        with self._sessions() as session:
            seen = self._existing_fronts(session, subtype)
            topics: dict[str, Topic] = {
                t.name.casefold(): t for t in session.scalars(select(Topic))
            }
            for card in cards:
                if outcome.accepted >= remaining:
                    break
                problem = card_problem(card, subtype)
                if problem is not None:
                    outcome.invalid += 1
                    outcome.discard(problem, card)
                    continue
                chunk = by_id.get(card.source.chunk_id)
                if chunk is None:
                    outcome.no_source += 1
                    outcome.discard("chunk_not_in_batch", card)
                    continue
                check = self._checker.check(card.source.quote, chunk.text)
                if not check.valid:
                    outcome.no_source += 1
                    outcome.discard(check.reason or "invalid_source", card)
                    continue
                key = normalize(card.front)[0]
                if key in seen:
                    outcome.duplicate += 1
                    outcome.discard("duplicate", card)
                    continue
                seen.add(key)
                topic = (
                    None
                    if forced_topic is not None
                    else upsert_topic(session, topics, clean_topic(card.topic))
                )
                session.add(
                    Item(
                        run_id=run_id,
                        kind="card",
                        subtype=subtype,
                        payload_json=json.dumps(
                            CardPayload(
                                front=card.front.strip(), back=card.back.strip()
                            ).model_dump(),
                            ensure_ascii=False,
                        ),
                        status="draft",
                        topic_id=forced_topic
                        if forced_topic is not None
                        else (topic.id if topic else None),
                        chunk_id=chunk.id,
                        source_title=chunk.material_title,
                        source_page=chunk.page,
                        quote=card.source.quote.strip(),
                    )
                )
                outcome.accepted += 1
            session.commit()

    @staticmethod
    def _existing_fronts(session: Session, subtype: str) -> set[str]:
        fronts: set[str] = set()
        rows = session.scalars(
            select(Item.payload_json).where(
                Item.kind == "card", Item.subtype == subtype, Item.status != "discarded"
            )
        )
        for payload in rows:
            fronts.add(normalize(str(json.loads(payload).get("front", "")))[0])
        return fronts
