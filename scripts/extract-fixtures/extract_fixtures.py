# Filename: extract_fixtures.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Extract reference values from the Python implementation into `fixtures/*.json`.

The TypeScript port is checked against these files (golden tests), so they must be generated
from the legacy code, never edited by hand. Run it from the repository root:

    uv run --project legacy python scripts/extract-fixtures/extract_fixtures.py
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from mind.generation.prompts import (
    SUBTYPE_RULES,
    PromptChunk,
    build_card_messages,
    render_avoid,
    render_chunks,
)
from mind.ingestion.chunker import chunk_segments
from mind.ingestion.extractors import markdown_segments
from mind.study.scheduler import CardSchedule, Rating, Scheduler
from mind.verification.source_checker import SourceChecker, locate_quote, normalize

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "fixtures"
START = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def write(name: str, payload: object) -> None:
    OUT.mkdir(exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    (OUT / f"{name}.json").write_text(text + "\n", encoding="utf-8")
    print(f"wrote fixtures/{name}.json")


def fsrs_fixture() -> dict[str, object]:
    """Review sequences with fuzzing off, each review made exactly when the card is due."""
    scheduler = Scheduler(desired_retention=0.9, enable_fuzzing=False)
    sequences = {
        "all_good": [3, 3, 3, 3, 3],
        "lapse_then_recover": [3, 3, 1, 3, 3],
        "hard_start": [2, 2, 3, 3],
        "easy_chain": [4, 4, 4],
        "mixed": [3, 1, 3, 4, 2, 3],
        "again_on_new": [1, 1, 3],
    }
    scenarios = []
    for name, ratings in sequences.items():
        state: CardSchedule | None = None
        now = START
        steps = []
        for value in ratings:
            state = scheduler.review(state, Rating(value), now)
            card = json.loads(state.fsrs_json)
            steps.append(
                {
                    "rating": value,
                    "reviewed_at": now.isoformat(),
                    "due": state.due.isoformat(),
                    "state": state.state,
                    "reps": state.reps,
                    "lapses": state.lapses,
                    "stability": card.get("stability"),
                    "difficulty": card.get("difficulty"),
                }
            )
            now = state.due
        scenarios.append({"name": name, "steps": steps})
    preview = {
        str(int(rating)): delta.total_seconds()
        for rating, delta in scheduler.preview(None, START).items()
    }
    return {
        "desired_retention": 0.9,
        "fuzzing": False,
        "start": START.isoformat(),
        "scenarios": scenarios,
        "new_card_preview_seconds": preview,
    }


def chunker_fixture() -> dict[str, object]:
    content = (ROOT / "samples" / "fotossintese.md").read_text(encoding="utf-8")
    segments = markdown_segments(content)
    drafts = chunk_segments(segments)
    long_text = "\n\n".join(
        " ".join(f"Frase número {i} do parágrafo {j}, com algum conteúdo de teste." for i in range(40))
        for j in range(3)
    )
    long_drafts = chunk_segments(markdown_segments(long_text, is_markdown=False), target=500, hard_max=700)
    return {
        "sample": "samples/fotossintese.md",
        "segments": [
            {"section": s.section, "page": s.page, "text": s.text} for s in segments
        ],
        "chunks": [{"section": d.section, "page": d.page, "text": d.text} for d in drafts],
        "long_text": long_text,
        "long_text_params": {"target": 500, "hard_max": 700},
        "long_text_chunks": [
            {"section": d.section, "page": d.page, "text": d.text} for d in long_drafts
        ],
    }


def source_checker_fixture() -> dict[str, object]:
    chunk = (
        "A fotossíntese converte luz em energia química. “Os cloroplastos” são organelas "
        "com clorofila — o pigmento verde — e ocorre nas folhas.\n\nA ﬁxação do carbono "
        "acontece no ciclo de Calvin."
    )
    quotes = [
        "A fotossíntese converte luz em energia química",
        '"Os cloroplastos" são organelas com clorofila',
        "organelas  com\nclorofila - o pigmento verde",
        "A FIXAÇÃO DO CARBONO ACONTECE NO CICLO DE CALVIN",
        "fixação do carbono",
        "curto demais",
        "texto que não existe no trecho de forma alguma",
    ]
    checker = SourceChecker()
    cases = []
    for quote in quotes:
        result = checker.check(quote, chunk)
        match = locate_quote(chunk, quote)
        cases.append(
            {
                "quote": quote,
                "valid": result.valid,
                "reason": result.reason,
                "start": match.start if match else None,
                "end": match.end if match else None,
            }
        )
    normalized = {}
    for text in ["Olá,  “mundo” — ﬁm­", "  A\tB\n C  "]:
        output, positions = normalize(text)
        normalized[text] = {"text": output, "positions": positions}
    return {"chunk": chunk, "min_quote_chars": 15, "cases": cases, "normalize": normalized}


def prompts_fixture() -> dict[str, object]:
    chunks = [
        PromptChunk(id=1, label="apostila.pdf, p. 12", text="A busca binária divide o intervalo."),
        PromptChunk(id=2, label="notas.md > Introdução", text="O ciclo de Calvin fixa carbono."),
    ]
    avoid = ["O que é a busca binária?"]
    messages = {}
    for subtype in SUBTYPE_RULES:
        built = build_card_messages(subtype, 3, chunks, avoid)
        messages[subtype] = [{"role": m.role, "content": m.content} for m in built]
    return {
        "chunks": [{"id": c.id, "label": c.label, "text": c.text} for c in chunks],
        "avoid": avoid,
        "count": 3,
        "rendered_chunks": render_chunks(chunks),
        "rendered_avoid": render_avoid(avoid),
        "card_messages": messages,
    }


def main() -> None:
    write("fsrs", fsrs_fixture())
    write("chunker", chunker_fixture())
    write("source-checker", source_checker_fixture())
    write("prompts", prompts_fixture())


if __name__ == "__main__":
    main()
