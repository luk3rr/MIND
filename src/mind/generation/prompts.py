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


QUESTION_SYSTEM = f"""You write exam-style practice questions from excerpts of the user's own \
study material.

Rules:
- Write every question in Brazilian Portuguese (pt-BR), even when the excerpts are in another \
language.
- Use ONLY information found in the excerpts. The correct answer must follow from the excerpt \
alone, never from outside knowledge.
- Each question tests one idea and has exactly one correct answer; avoid ambiguity, double \
negatives and "all/none of the above".
- For every question, set `source.chunk_id` to the id of the excerpt that proves the answer and \
`source.quote` to a passage copied VERBATIM from that excerpt, in its original language, \
between {MIN_QUOTE} and {MAX_QUOTE} characters long.
- `explanation` is a short comment (one to three sentences) that justifies the answer.
- Write mathematical formulas in LaTeX between $...$ or $$...$$.
- Set `topic` to a short, consistent label (up to 5 words).
- Do not repeat a question.
"""

PROFILE_RULES: dict[str, str] = {
    "certo_errado": (
        'Question type "certo_errado": `statement` is one self-contained claim that is either '
        'right or wrong according to the excerpt. Set `answer` to "C" (right) or "E" (wrong) and '
        "leave `options` empty. Make about half of the claims right and half wrong; a wrong "
        "claim must change a meaningful detail of the excerpt, not be absurd."
    ),
    "multiple_choice_4": (
        'Question type "multiple_choice" with exactly 4 options: `statement` is the question; '
        '`options` has keys "A" to "D" in order, each with `text` and `why` (why it is right or '
        "wrong); `answer` is the key of the single correct option. Distractors must be plausible "
        "and clearly different from each other."
    ),
    "multiple_choice_5": (
        'Question type "multiple_choice" with exactly 5 options: `statement` is the question; '
        '`options` has keys "A" to "E" in order, each with `text` and `why` (why it is right or '
        "wrong); `answer` is the key of the single correct option. Distractors must be plausible "
        "and clearly different from each other."
    ),
}

JUDGE_SYSTEM = """You are a strict reviewer of exam questions. For each numbered question you \
receive the source excerpt, the question, its options (if any) and the proposed answer.

A question is `supported` only if ALL of these hold:
1. The proposed answer is established by the excerpt alone.
2. Exactly one option (or the right/wrong verdict) is correct; no other option is also defensible.
3. The statement is unambiguous.
Otherwise it is not supported. When in doubt, answer `supported: false`. Return one verdict per \
question, using its `index`, with a short `reason`.
"""


@dataclass(frozen=True)
class JudgeItem:
    excerpt: str
    statement: str
    options: list[tuple[str, str]]
    answer: str


def build_question_messages(profile: str, count: int, chunks: list[PromptChunk]) -> list[Message]:
    task = (
        f"Create exactly {count} questions from the excerpts below. {PROFILE_RULES[profile]}\n\n"
        f"Excerpts:\n\n{render_chunks(chunks)}"
    )
    return [Message(role="system", content=QUESTION_SYSTEM), Message(role="user", content=task)]


def build_judge_messages(items: list[JudgeItem]) -> list[Message]:
    blocks = []
    for index, item in enumerate(items):
        options = "\n".join(f"  {key}) {text}" for key, text in item.options) or "  (certo/errado)"
        blocks.append(
            f"[question {index}]\nExcerpt:\n{item.excerpt}\n\nStatement: {item.statement}\n"
            f"Options:\n{options}\nProposed answer: {item.answer}"
        )
    return [
        Message(role="system", content=JUDGE_SYSTEM),
        Message(role="user", content="\n\n".join(blocks)),
    ]
