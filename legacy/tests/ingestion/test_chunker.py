# Filename: test_chunker.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from mind.ingestion.chunker import HARD_MAX_CHARS, TARGET_CHARS, chunk_segments
from mind.ingestion.extractors import Segment


def test_short_paragraphs_of_one_page_are_merged() -> None:
    segment = Segment(text="Um.\n\nDois.\n\nTrês.", page=4)
    drafts = chunk_segments([segment])
    assert len(drafts) == 1
    assert drafts[0].page == 4
    assert drafts[0].text == "Um.\n\nDois.\n\nTrês."


def test_chunks_never_cross_pages_or_sections() -> None:
    drafts = chunk_segments(
        [
            Segment("A.", page=1),
            Segment("B.", page=2),
            Segment("C.", section="Cap 1"),
            Segment("D.", section="Cap 2"),
        ]
    )
    assert [(d.page, d.section, d.text) for d in drafts] == [
        (1, None, "A."),
        (2, None, "B."),
        (None, "Cap 1", "C."),
        (None, "Cap 2", "D."),
    ]


def test_a_full_chunk_starts_a_new_one() -> None:
    paragraph = "palavra " * 100  # 800 characters
    drafts = chunk_segments([Segment("\n\n".join([paragraph.strip()] * 3), page=1)])
    assert len(drafts) == 3
    assert all(len(d.text) <= TARGET_CHARS for d in drafts)


def test_long_paragraphs_are_split_at_sentence_ends() -> None:
    sentence = "Esta é uma frase de tamanho razoável para o teste. "
    paragraph = (sentence * 60).strip()  # ~3000 characters, one paragraph
    drafts = chunk_segments([Segment(paragraph, page=1)])
    assert len(drafts) >= 2
    assert all(len(d.text) <= HARD_MAX_CHARS for d in drafts)
    assert all(d.text.endswith(".") for d in drafts)
    assert " ".join(d.text for d in drafts) == paragraph


def test_a_single_huge_token_stream_is_hard_split() -> None:
    blob = "x" * 4000
    drafts = chunk_segments([Segment(blob, page=1)])
    assert all(len(d.text) <= HARD_MAX_CHARS for d in drafts)
    assert "".join(d.text for d in drafts) == blob


def test_empty_input_gives_no_chunks() -> None:
    assert chunk_segments([]) == []
