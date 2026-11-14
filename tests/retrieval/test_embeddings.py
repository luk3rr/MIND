# Filename: test_embeddings.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import Chunk, Material
from mind.retrieval.embeddings import (
    EmbeddingRetriever,
    EmbeddingStore,
    EmbeddingsUnavailable,
    HybridRetriever,
    SentenceTransformerEmbedder,
    dot,
    extra_installed,
    normalize_vector,
    pack,
    unpack,
)
from mind.retrieval.retriever import Bm25Retriever
from tests.helpers import TopicEmbedder


@pytest.fixture
def library(workspace_sessions: sessionmaker[Session]) -> sessionmaker[Session]:
    with workspace_sessions() as session:
        first = Material(title="Aula 1", kind="md", filename="a.md", stored_path="a.md")
        second = Material(title="Aula 2", kind="md", filename="b.md", stored_path="b.md")
        first.chunks = [
            Chunk(ordinal=0, page=1, text="A mitocôndria gera energia para a célula."),
            Chunk(ordinal=1, page=2, text="O DNA carrega a informação genética."),
        ]
        second.chunks = [Chunk(ordinal=0, page=5, text="O ribossomo sintetiza proteínas.")]
        session.add_all([first, second])
        session.commit()
    return workspace_sessions


def test_vectors_round_trip_as_normalized_float32() -> None:
    blob = pack([3.0, 4.0])
    assert len(blob) == 8
    assert list(unpack(blob)) == pytest.approx([0.6, 0.8])
    assert normalize_vector([0.0, 0.0]) == [0.0, 0.0]
    assert dot([1.0, 0.0], [0.5, 0.5]) == 0.5


def test_indexing_embeds_only_the_pending_chunks_and_reports_progress(
    library: sessionmaker[Session],
) -> None:
    store = EmbeddingStore(library, TopicEmbedder(), available=True)
    assert (store.status().indexed, store.status().total, store.enabled()) == (0, 3, False)
    seen: list[float] = []
    assert store.index_pending(lambda progress, _message: seen.append(progress)) == 3
    assert seen[-1] == 1.0
    assert store.index_pending() == 0
    assert store.status().indexed == 3
    store.set_enabled(True)
    assert store.enabled()


def test_semantic_search_ranks_by_cosine_and_respects_filters(
    library: sessionmaker[Session],
) -> None:
    EmbeddingStore(library, TopicEmbedder(), available=True).index_pending()
    retriever = EmbeddingRetriever(library, TopicEmbedder())
    [best, *_] = retriever.search("Como a célula obtém energia?")
    assert (best.material_title, best.page, round(best.score, 3)) == ("Aula 1", 1, 1.0)
    assert retriever.search("energia", material_ids=[2], limit=5)[0].material_title == "Aula 2"
    assert retriever.search("energia", page_from=5)[0].page == 5
    assert retriever.search("energia", page_to=0) == []
    assert retriever.search("   ") == []


def test_fusion_finds_what_bm25_misses_and_keeps_what_both_find(
    library: sessionmaker[Session],
) -> None:
    EmbeddingStore(library, TopicEmbedder(), available=True).index_pending()
    hybrid = HybridRetriever(Bm25Retriever(library), EmbeddingRetriever(library, TopicEmbedder()))
    # "genética" is an exact word for BM25 and an axis for the embedder: ranked first by both.
    found = hybrid.search("informação genética", limit=3)
    assert found[0].text.startswith("O DNA")
    assert found[0].score > found[-1].score
    assert len({c.chunk_id for c in found}) == len(found)


def test_without_the_extra_the_hybrid_falls_back_to_bm25(library: sessionmaker[Session]) -> None:
    class Broken:
        def search(self, *_args: object, **_kwargs: object) -> list[object]:
            raise EmbeddingsUnavailable("no extra")

    hybrid = HybridRetriever(Bm25Retriever(library), Broken())  # type: ignore[arg-type]
    assert [c.page for c in hybrid.search("ribossomo proteínas")] == [5]


def test_the_real_embedder_explains_how_to_install_the_extra() -> None:
    if extra_installed():  # pragma: no cover - only with the extra installed
        pytest.skip("the extra is installed; the real model is not exercised here")
    with pytest.raises(EmbeddingsUnavailable, match="embeddings"):
        SentenceTransformerEmbedder().embed(["texto"])
