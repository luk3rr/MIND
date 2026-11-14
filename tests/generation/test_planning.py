# Filename: test_planning.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import pytest

from mind.generation.planning import (
    PlannedBatch,
    SourceChunk,
    make_batches,
    plan_batches,
    split_quantity,
    spread_indices,
)


def chunk(chunk_id: int, size: int = 1000, page: int | None = None) -> SourceChunk:
    return SourceChunk(chunk_id, 1, "Aula", page, None, "x" * size)


def test_label_combines_title_page_and_section() -> None:
    assert SourceChunk(1, 1, "Aula", 3, "Cap 1", "t").label == "Aula p.3 Cap 1"
    assert SourceChunk(1, 1, "Notas", None, None, "t").label == "Notas"


def test_batches_group_chunks_up_to_the_character_budget() -> None:
    chunks = [chunk(i, 2500) for i in range(5)]
    batches = make_batches(chunks, max_chars=6000)
    assert [[c.id for c in b] for b in batches] == [[0, 1], [2, 3], [4]]
    assert make_batches([]) == []


def test_an_oversized_chunk_still_gets_its_own_batch() -> None:
    batches = make_batches([chunk(1, 10_000), chunk(2, 100)], max_chars=6000)
    assert [[c.id for c in b] for b in batches] == [[1], [2]]


@pytest.mark.parametrize(
    ("quantity", "parts", "expected"),
    [(20, 4, [5, 5, 5, 5]), (22, 5, [5, 5, 4, 4, 4]), (3, 3, [1, 1, 1]), (7, 1, [7])],
)
def test_quantity_is_split_as_evenly_as_possible(
    quantity: int, parts: int, expected: list[int]
) -> None:
    assert split_quantity(quantity, parts) == expected
    assert sum(expected) == quantity


def test_spread_indices_cover_the_whole_range() -> None:
    assert spread_indices(10, 3) == [0, 4, 9]
    assert spread_indices(4, 4) == [0, 1, 2, 3]
    assert spread_indices(3, 10) == [0, 1, 2]
    assert spread_indices(9, 1) == [4]


def test_plan_asks_five_cards_per_batch_and_spreads_batches() -> None:
    chunks = [chunk(i, 6000) for i in range(12)]  # twelve batches of one chunk
    plan = plan_batches(chunks, 20)
    assert [p.count for p in plan] == [5, 5, 5, 5]
    ids = [p.chunks[0].id for p in plan]
    assert ids[0] == 0
    assert ids[-1] == 11
    assert ids == sorted(ids)


def test_plan_uses_every_batch_when_there_are_few() -> None:
    plan = plan_batches([chunk(1, 100), chunk(2, 100)], 20)
    assert plan == [PlannedBatch([chunk(1, 100), chunk(2, 100)], 20)]


def test_plan_is_empty_without_chunks_or_quantity() -> None:
    assert plan_batches([], 10) == []
    assert plan_batches([chunk(1)], 0) == []
