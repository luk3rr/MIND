# Filename: test_bm25.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Chunk, Material
from mind.retrieval.retriever import Bm25Retriever, build_match_query


def add_material(
    sessions: sessionmaker[Session], title: str, chunks: list[tuple[int | None, str]]
) -> int:
    with sessions() as session:
        material = Material(title=title, kind="pdf", filename=f"{title}.pdf", stored_path="x")
        material.chunks = [
            Chunk(ordinal=i, page=page, text=text) for i, (page, text) in enumerate(chunks)
        ]
        session.add(material)
        session.commit()
        return material.id


@pytest.fixture
def retriever(workspace_sessions: sessionmaker[Session]) -> Bm25Retriever:
    add_material(
        workspace_sessions,
        "Biologia",
        [
            (1, "A mitocôndria produz energia para a célula."),
            (2, "O núcleo guarda o DNA da célula. Célula célula célula."),
            (3, "Fotossíntese ocorre nos cloroplastos."),
        ],
    )
    add_material(workspace_sessions, "Física", [(1, "A energia cinética depende da massa.")])
    return Bm25Retriever(workspace_sessions)


def test_results_are_ranked_by_relevance_and_carry_origin(retriever: Bm25Retriever) -> None:
    results = retriever.search("célula")
    assert [r.page for r in results] == [2, 1]
    assert results[0].material_title == "Biologia"
    assert results[0].score > results[1].score > 0


def test_search_ignores_accents_and_case(retriever: Bm25Retriever) -> None:
    assert [r.page for r in retriever.search("MITOCONDRIA")] == [1]
    assert [r.page for r in retriever.search("fotossintese cloroplastos")] == [3]


def test_any_term_matches(retriever: Bm25Retriever) -> None:
    pages = {(r.material_title, r.page) for r in retriever.search("energia cloroplastos")}
    assert pages == {("Biologia", 1), ("Biologia", 3), ("Física", 1)}


def test_filters_by_material_and_page_range(
    retriever: Bm25Retriever, workspace_sessions: sessionmaker[Session]
) -> None:
    with workspace_sessions() as session:
        physics_id = session.query(Material.id).filter_by(title="Física").scalar()
    only_physics = retriever.search("energia", material_ids=[physics_id])
    assert [r.material_title for r in only_physics] == ["Física"]
    assert retriever.search("energia", material_ids=[]) == []

    in_range = retriever.search("célula energia", page_from=2, page_to=2)
    assert [r.page for r in in_range] == [2]
    assert [r.page for r in retriever.search("célula", page_from=3)] == []


def test_limit_caps_the_number_of_results(retriever: Bm25Retriever) -> None:
    assert len(retriever.search("energia célula", limit=2)) == 2
    assert retriever.search("energia", limit=0) == []


@pytest.mark.parametrize("query", ["", "   ", '"', "AND OR NOT", "( ) * ^", 'célula"; DROP'])
def test_unusual_queries_never_break_the_fts_syntax(retriever: Bm25Retriever, query: str) -> None:
    retriever.search(query)  # must not raise


def test_no_match_returns_an_empty_list(retriever: Bm25Retriever) -> None:
    assert retriever.search("inexistente") == []


def test_build_match_query_quotes_every_term() -> None:
    assert build_match_query("a-b c") == '"a" OR "b" OR "c"'
    assert build_match_query("???") is None
    capped = build_match_query("t " * 100)
    assert capped is not None
    assert capped.count("OR") == 31
