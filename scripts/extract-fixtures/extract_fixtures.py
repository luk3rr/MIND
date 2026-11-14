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
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import docx
import pymupdf

from mind.generation.prompts import (
    PROFILE_RULES,
    SUBTYPE_RULES,
    JudgeItem,
    PromptChunk,
    build_card_messages,
    build_judge_messages,
    build_question_messages,
    render_avoid,
    render_chunks,
)
from mind.ingestion.chunker import chunk_segments
from mind.ingestion.extractors import (
    DocxExtractor,
    PdfExtractor,
    TextExtractor,
    markdown_segments,
    reflow_paragraphs,
)
from mind.chat.prompts import CHAT_SYSTEM, build_chat_messages
from mind.db import migrate
from mind.db.base import make_session_factory
from mind.db.workspace_models import Attempt, GenerationRun, Item, ReviewLog, Topic
from mind.error_notebook.service import error_card_text
from mind.stats.service import StatsService
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
    questions = {}
    for profile in PROFILE_RULES:
        built = build_question_messages(profile, 2, chunks, avoid)
        questions[profile] = [{"role": m.role, "content": m.content} for m in built]
    judge_items = [
        JudgeItem(
            excerpt="A busca binária divide o intervalo.",
            statement="A busca binária divide o intervalo ao meio.",
            options=[],
            answer="C",
        ),
        JudgeItem(
            excerpt="O ciclo de Calvin fixa carbono.",
            statement="Qual ciclo fixa carbono?",
            options=[("A", "Calvin"), ("B", "Krebs")],
            answer="A",
        ),
    ]
    judge = [{"role": m.role, "content": m.content} for m in build_judge_messages(judge_items)]
    return {
        "chunks": [{"id": c.id, "label": c.label, "text": c.text} for c in chunks],
        "avoid": avoid,
        "count": 3,
        "rendered_chunks": render_chunks(chunks),
        "rendered_avoid": render_avoid(avoid),
        "card_messages": messages,
        "question_messages": questions,
        "question_count": 2,
        "judge_items": [
            {
                "excerpt": item.excerpt,
                "statement": item.statement,
                "options": [list(option) for option in item.options],
                "answer": item.answer,
            }
            for item in judge_items
        ],
        "judge_messages": judge,
        "chat_system": CHAT_SYSTEM,
        "chat_question": "Como funciona a busca binária?",
        "chat_messages": [
            {"role": m.role, "content": m.content}
            for m in build_chat_messages("Como funciona a busca binária?", chunks)
        ],
    }


PAGE_RECT = pymupdf.Rect(50, 50, 545, 790)


def make_pdf(path: Path, pages: list[str], *, fontsize: float = 11) -> Path:
    """Write a PDF with one page per string (an empty string makes a blank page)."""
    document = pymupdf.open()
    for text in pages:
        page = document.new_page()
        if text:
            remaining = page.insert_textbox(PAGE_RECT, text, fontsize=fontsize, fontname="helv")
            assert remaining >= 0, "test text does not fit on the page"
    document.save(path)
    document.close()
    return path


LONG_PAGE_1 = (
    "O sistema opera com várias camadas inde-\npendentes entre si e cada uma\n"
    "tem uma função bem definida.\n\nNova ideia começa aqui e segue\n"
    "por mais uma linha longa também, com acentuação: ção, ã, é, ü.\n"
    "Termina em ponto final."
)
LONG_PAGE_2 = "Segunda página com outro parágrafo.\n\nE mais um parágrafo curto."


def extractors_fixture() -> dict[str, object]:
    """PDFs and the text the Python extractor reads from them, plus reflow and Markdown cases."""
    pdf_dir = OUT / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    make_pdf(pdf_dir / "three-pages.pdf", ["Primeira página com função.", "", "Terceira página."])
    make_pdf(pdf_dir / "long.pdf", [LONG_PAGE_1, LONG_PAGE_2])
    make_pdf(pdf_dir / "blank.pdf", ["", ""])
    make_pdf(pdf_dir / "big-100.pdf", [f"Página {i} do documento de teste. " * 12 for i in range(1, 101)])
    with tempfile.TemporaryDirectory() as temp:
        plain = make_pdf(Path(temp) / "plain.pdf", ["secret"])
        document = pymupdf.open(plain)
        document.save(
            pdf_dir / "locked.pdf",
            encryption=getattr(pymupdf, "PDF_ENCRYPT_AES_256"),  # noqa: B009
            owner_pw="owner",
            user_pw="user",
        )
        document.close()
    pdfs: dict[str, object] = {}
    for name in ("three-pages", "long", "big-100"):
        result = PdfExtractor().extract(pdf_dir / f"{name}.pdf")
        pdfs[name] = {
            "page_count": result.page_count,
            "segments": [{"page": seg.page, "text": seg.text} for seg in result.segments],
        }
    reflow_inputs = [
        "O sistema opera com várias\ncamadas inde-\npendentes entre si e cada uma\n"
        "tem uma função.\nNova ideia começa aqui e segue\npor mais uma linha longa também.\n",
        "um\n\ndois\n",
        "   \n\n  ",
        "linha curta\noutra curta\n",
    ]
    markdown_cases = [
        "Intro solta.\n\n# Biologia\n\nCélula.\n\n## Núcleo\n\nDNA.\n\n# Química\n\nÁtomo.\n",
        "# Real\n\n```\n# not a heading\n```\n",
        "# Título\ncorpo com\nquebra\n\n### Fundo\n\nTexto.\n",
    ]
    with tempfile.TemporaryDirectory() as temp:
        text_file = Path(temp) / "plain.txt"
        text_file.write_text("# not a heading\nwrapped\nline\n\nSecond paragraph.", encoding="utf-8")
        plain_result = TextExtractor().extract(text_file)
    return {
        "pdfs": pdfs,
        "reflow": [{"input": text, "output": reflow_paragraphs(text)} for text in reflow_inputs],
        "markdown": [
            {
                "input": text,
                "segments": [{"section": s.section, "text": s.text} for s in markdown_segments(text)],
            }
            for text in markdown_cases
        ],
        "plain_text": {
            "input": "# not a heading\nwrapped\nline\n\nSecond paragraph.",
            "segments": [{"section": s.section, "text": s.text} for s in plain_result.segments],
        },
    }


def docx_and_scanned_fixture() -> dict[str, object]:
    """A Word document and an image-only PDF, with what the Python code reads from the Word file."""
    docx_dir = OUT / "docx"
    docx_dir.mkdir(parents=True, exist_ok=True)
    document = docx.Document()
    document.add_heading("Biologia", level=1)
    document.add_paragraph("A fotossíntese ocorre nos cloroplastos.")
    document.add_heading("Núcleo", level=2)
    document.add_paragraph("O DNA fica no   núcleo da célula.")
    table = document.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Organela"
    table.rows[0].cells[1].text = "Função"
    table.rows[1].cells[0].text = "Mitocôndria"
    table.rows[1].cells[1].text = "Energia"
    document.add_heading("Química", level=1)
    document.add_paragraph("O átomo é a menor unidade.")
    document.save(docx_dir / "sample.docx")
    (docx_dir / "broken.docx").write_bytes(b"not a zip at all")
    result = DocxExtractor().extract(docx_dir / "sample.docx")
    # An image-only PDF: the text is drawn, rendered to a bitmap and placed as a picture.
    source = pymupdf.open()
    page = source.new_page()
    page.insert_textbox(
        pymupdf.Rect(50, 100, 545, 300),
        "A fotossintese converte luz em energia quimica nos cloroplastos.",
        fontsize=20,
        fontname="helv",
    )
    clip = pymupdf.Rect(40, 95, 555, 175)
    pixmap = page.get_pixmap(dpi=200, clip=clip, colorspace=pymupdf.csGRAY)
    scanned = pymupdf.open()
    target = scanned.new_page(width=clip.width, height=clip.height)
    target.insert_image(target.rect, stream=pixmap.tobytes("png"))
    scanned.save(OUT / "pdfs" / "scanned.pdf")
    return {
        "docx": [{"section": seg.section, "text": seg.text} for seg in result.segments],
        "scanned_terms": ["fotossintese", "luz", "energia", "cloroplastos"],
    }


def stats_fixture() -> dict[str, object]:
    """A seeded workspace and what the statistics report for it, plus the error-card texts."""
    now = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)
    from datetime import timedelta, timezone

    brt = timezone(timedelta(hours=-3))

    def day(offset: int) -> str:
        return (datetime(2026, 11, 14) + timedelta(days=offset)).strftime("%Y-%m-%d")

    topics = ["Células", "Genética", "Ecologia"]
    # (id, kind, topic index or None, status)
    items = [
        (1, "card", 0, "approved"),
        (2, "card", 0, "approved"),
        (3, "question", 0, "approved"),
        (4, "card", 1, "approved"),
        (5, "question", 1, "approved"),
        (6, "card", None, "approved"),
        (7, "card", 2, "approved"),
        (8, "card", 2, "draft"),
    ]
    # (item, rating, day offset, previous state or None)
    reviews = [
        (1, 3, 0, 2), (1, 3, 0, 2), (1, 1, 0, 2), (1, 2, -1, 2), (1, 4, -2, 2),
        (2, 3, 0, 1), (2, 1, -3, None), (4, 1, 0, 2), (4, 1, -1, 2), (4, 3, -2, 2),
        (4, 3, -3, 2), (4, 1, -4, 2), (6, 2, -10, 2), (6, 3, -9, 2), (7, 3, -40, 2),
        (8, 3, 0, 2),
    ]  # fmt: skip
    # (item, correct, day offset)
    attempts = [
        (3, True, 0), (3, False, 0), (3, True, -1), (5, False, -1), (5, False, -2), (5, True, -3),
    ]  # fmt: skip
    with tempfile.TemporaryDirectory() as tmp:
        engine = migrate.upgrade("workspace", Path(tmp) / "workspace.db")
        sessions = make_session_factory(engine)
        with sessions() as session:
            run = GenerationRun(kind="card", subtype="qa", model="m", requested=1)
            session.add(run)
            session.flush()
            topic_rows = [Topic(name=name) for name in topics]
            session.add_all(topic_rows)
            session.flush()
            for item_id, kind, topic_index, status in items:
                session.add(
                    Item(
                        id=item_id,
                        run_id=run.id,
                        kind=kind,
                        subtype="qa",
                        payload_json="{}",
                        status=status,
                        topic_id=None if topic_index is None else topic_rows[topic_index].id,
                    )
                )
            session.flush()
            for item_id, rating, offset, state in reviews:
                session.add(
                    ReviewLog(
                        item_id=item_id,
                        rating=rating,
                        day=day(offset),
                        previous_state_json=None if state is None else json.dumps({"state": state}),
                        reviewed_at=now,
                    )
                )
            for item_id, correct, offset in attempts:
                session.add(
                    Attempt(item_id=item_id, answer="A", correct=correct, day=day(offset), answered_at=now)
                )
            session.commit()
        stats = StatsService(sessions, clock=lambda: now, tz=brt)
        topic_stats = [
            {
                "name": t.name,
                "cardReviews": t.card_reviews,
                "cardPasses": t.card_passes,
                "questionAttempts": t.question_attempts,
                "questionCorrect": t.question_correct,
                "accuracy": t.accuracy,
                "smallSample": t.small_sample,
            }
            for t in stats.topic_stats()
        ]
        weakest = [t.name for t in stats.weakest_topics(limit=5, min_events=2)]
        retention = stats.retention(30, now)
        summary = stats.summary(now)
        out: dict[str, object] = {
            "topics": topics,
            "items": [list(i) for i in items],
            "reviews": [list(r) for r in reviews],
            "attempts": [list(a) for a in attempts],
            "topicStats": topic_stats,
            "weakest": weakest,
            "retention": [[d.day, d.reviews, d.passes] for d in retention.days],
            "activity": [[d.day, d.reviews, d.attempts] for d in stats.activity(30, now)],
            "summary": {
                "reviewedToday": summary.reviewed_today,
                "answeredToday": summary.answered_today,
                "goal": summary.goal,
                "currentStreak": summary.current_streak,
                "longestStreak": summary.longest_streak,
                "totalReviews": summary.total_reviews,
                "totalAttempts": summary.total_attempts,
            },
        }
        engine.dispose()
    mc = {
        "statement": "Qual organela faz a respiração celular?",
        "options": [{"key": "A", "text": "Núcleo", "why": "x"}, {"key": "B", "text": "Mitocôndria", "why": "y"}],
        "answer": "B",
        "explanation": "A mitocôndria respira.",
    }
    tf = {
        "statement": "O núcleo faz a respiração celular.",
        "options": [{"key": "C", "text": "Certo", "why": ""}, {"key": "E", "text": "Errado", "why": ""}],
        "answer": "E",
        "explanation": "Quem respira é a mitocôndria.",
    }
    ce_true = {**tf, "answer": "C"}
    out["errorCards"] = {
        name: list(error_card_text(subtype, payload))
        for name, subtype, payload in (
            ("multiple_choice", "multiple_choice", mc),
            ("certo_errado_false", "certo_errado", tf),
            ("certo_errado_true", "certo_errado", ce_true),
        )
    }
    out["errorCardPayloads"] = {"multiple_choice": mc, "certo_errado_false": tf, "certo_errado_true": ce_true}
    return out


def main() -> None:
    write("fsrs", fsrs_fixture())
    write("chunker", chunker_fixture())
    write("source-checker", source_checker_fixture())
    write("prompts", prompts_fixture())
    write("extractors", extractors_fixture())
    write("docx-and-scanned", docx_and_scanned_fixture())
    write("stats", stats_fixture())


if __name__ == "__main__":
    main()
