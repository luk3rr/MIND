# Filename: prompts.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Prompts that ask the model for flashcards (instructions in English, cards in pt-BR)."""

from __future__ import annotations

from dataclasses import dataclass

from mind.llm.types import Message

MIN_QUOTE = 15
MAX_QUOTE = 300

SYSTEM = f"""You write study flashcards from excerpts of the user's own study material.

Rules:
- Write every card in Brazilian Portuguese (pt-BR), even when the excerpts are in another \
language. Keep technical terms that are normally left untranslated.
- Use ONLY information found in the excerpts. Never add outside knowledge.
- Each card must be atomic: one concept per card, short and unambiguous.
- For every card, set `source.chunk_id` to the id of the excerpt that supports it and \
`source.quote` to a passage copied VERBATIM from that excerpt, in its original language, \
between {MIN_QUOTE} and {MAX_QUOTE} characters long. Do not paraphrase, translate or \
correct the quote.
- Write mathematical formulas in LaTeX between $...$ (inline) or $$...$$ (display).
- Set `topic` to a short, consistent label (up to 5 words) so related cards share it.
- Do not repeat a card. Prefer facts, definitions, rules and relations that are worth \
memorizing; skip trivia, headings and formatting remarks.
"""

SUBTYPE_RULES: dict[str, str] = {
    "qa": ('Card type "qa": `front` is a clear question; `back` is the short, complete answer.'),
    "cloze": (
        'Card type "cloze": `front` is a sentence from the material with the key term hidden '
        "as {{c1::term}} (use {{c2::...}} for a second gap if needed); `back` is an optional "
        "short extra comment and may be an empty string."
    ),
    "compare": (
        'Card type "compare": `front` names two or more similar concepts as "X vs Y"; `back` '
        "is a short Markdown table or list of the differences that matter."
    ),
    "true_false": (
        'Card type "true_false": `front` is one statement; `back` starts with "Verdadeiro" or '
        '"Falso" followed by a one-sentence explanation. Mix true and false statements.'
    ),
}


@dataclass(frozen=True)
class PromptChunk:
    id: int
    label: str
    text: str


def render_chunks(chunks: list[PromptChunk]) -> str:
    return "\n\n".join(f"[excerpt {c.id} | {c.label}]\n{c.text}" for c in chunks)


def build_card_messages(subtype: str, count: int, chunks: list[PromptChunk]) -> list[Message]:
    task = (
        f"Create exactly {count} flashcards of one type from the excerpts below. "
        f'{SUBTYPE_RULES[subtype]} Every card must use `subtype` = "{subtype}".\n\n'
        f"Excerpts:\n\n{render_chunks(chunks)}"
    )
    return [Message(role="system", content=SYSTEM), Message(role="user", content=task)]
