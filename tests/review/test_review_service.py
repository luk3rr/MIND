# Filename: test_review_service.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import GenerationRun, Item
from mind.errors import ItemNotFound, ValidationFailed
from mind.review.service import ReviewService


def make_run(sessions: sessionmaker[Session]) -> int:
    with sessions() as session:
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=5, generated=3)
        session.add(run)
        session.commit()
        return run.id


def add_item(
    sessions: sessionmaker[Session],
    run_id: int,
    front: str,
    *,
    subtype: str = "qa",
    back: str = "Resposta.",
    status: str = "draft",
) -> int:
    with sessions() as session:
        item = Item(
            run_id=run_id,
            kind="card",
            subtype=subtype,
            payload_json=json.dumps({"front": front, "back": back}),
            status=status,
            source_title="Aula",
            source_page=2,
            quote="citação original do trecho",
        )
        session.add(item)
        session.commit()
        return item.id


def run_counters(sessions: sessionmaker[Session], run_id: int) -> tuple[int, int, int]:
    with sessions() as session:
        run = session.get(GenerationRun, run_id)
        assert run is not None
        return run.approved, run.approved_unedited, run.discarded_review


@pytest.fixture
def review(workspace_sessions: sessionmaker[Session]) -> ReviewService:
    return ReviewService(workspace_sessions)


def test_items_are_listed_with_filters_and_a_count(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_a, run_b = make_run(workspace_sessions), make_run(workspace_sessions)
    first = add_item(workspace_sessions, run_a, "Um?")
    add_item(workspace_sessions, run_a, "Dois?", status="approved")
    add_item(workspace_sessions, run_b, "Três?")

    assert [i.id for i in review.list_items(run_id=run_a)] == [first, first + 1]
    assert [i.front for i in review.list_items(status="draft")] == ["Um?", "Três?"]
    assert review.count(run_id=run_a) == 2
    assert review.count(status="approved") == 1
    assert review.list_items(kind="question") == []
    assert [i.front for i in review.list_items(limit=1, offset=1)] == ["Dois?"]
    item = review.get(first)
    assert (item.source_title, item.source_page, item.quote) == (
        "Aula",
        2,
        "citação original do trecho",
    )
    assert item.topic is None


def test_unknown_items_raise_not_found(review: ReviewService) -> None:
    with pytest.raises(ItemNotFound):
        review.get(1)
    with pytest.raises(ItemNotFound):
        review.edit(1, "a", "b", None)


def test_editing_changes_the_text_marks_the_item_and_keeps_the_source(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    item_id = add_item(workspace_sessions, make_run(workspace_sessions), "Antiga?")
    edited = review.edit(item_id, " Nova pergunta? ", "Nova resposta.", "  Biologia  celular ")
    assert (edited.front, edited.back, edited.edited) == ("Nova pergunta?", "Nova resposta.", True)
    assert edited.topic == "Biologia celular"
    assert edited.quote == "citação original do trecho"

    again = review.edit(item_id, "Nova pergunta?", "Nova resposta.", "biologia CELULAR")
    assert again.topic == "Biologia celular"


def test_changing_only_the_topic_does_not_count_as_an_edit(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    item_id = add_item(workspace_sessions, make_run(workspace_sessions), "Igual?")
    result = review.edit(item_id, "Igual?", "Resposta.", "Tema")
    assert result.edited is False
    assert result.topic == "Tema"


@pytest.mark.parametrize(
    ("subtype", "front", "back", "field"),
    [
        ("qa", "  ", "Resposta.", "front"),
        ("qa", "Pergunta?", "", "back"),
        ("cloze", "sem lacuna", "", "front"),
        ("true_false", "Afirmação.", "Talvez.", "back"),
    ],
)
def test_invalid_edits_are_rejected_with_the_field(
    workspace_sessions: sessionmaker[Session],
    review: ReviewService,
    subtype: str,
    front: str,
    back: str,
    field: str,
) -> None:
    item_id = add_item(workspace_sessions, make_run(workspace_sessions), "Ok?", subtype=subtype)
    with pytest.raises(ValidationFailed) as error:
        review.edit(item_id, front, back, None)
    assert error.value.errors[0].field == field


def test_discarded_items_cannot_be_edited(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    item_id = add_item(workspace_sessions, make_run(workspace_sessions), "X?", status="discarded")
    with pytest.raises(ValidationFailed):
        review.edit(item_id, "Y?", "Z", None)


def test_review_approves_and_discards_and_counts_unedited_approvals(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_id = make_run(workspace_sessions)
    ids = [add_item(workspace_sessions, run_id, f"P{i}?") for i in range(5)]
    review.edit(ids[1], "P1 editada?", "Resposta.", None)

    result = review.review(approve=ids[:3], discard=ids[3:])

    assert (result.approved, result.discarded, result.skipped) == (3, 2, 0)
    assert run_counters(workspace_sessions, run_id) == (3, 2, 2)
    statuses = [i.status for i in review.list_items(run_id=run_id)]
    assert statuses == ["approved"] * 3 + ["discarded"] * 2
    assert review.get(ids[0]).approved_at is not None


def test_only_drafts_can_be_reviewed_and_double_clicks_are_harmless(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_id = make_run(workspace_sessions)
    draft = add_item(workspace_sessions, run_id, "A?")
    done = add_item(workspace_sessions, run_id, "B?", status="approved")

    first = review.review(approve=[draft, draft, done, 999])
    second = review.review(approve=[draft])

    assert (first.approved, first.skipped) == (1, 2)
    assert (second.approved, second.skipped) == (0, 1)
    assert run_counters(workspace_sessions, run_id) == (1, 1, 0)


def test_an_item_in_both_lists_is_approved_not_discarded(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_id = make_run(workspace_sessions)
    item_id = add_item(workspace_sessions, run_id, "A?")
    result = review.review(approve=[item_id], discard=[item_id])
    assert (result.approved, result.discarded, result.skipped) == (1, 0, 1)
    assert review.get(item_id).status == "approved"


def test_editing_after_approval_does_not_change_the_counters(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_id = make_run(workspace_sessions)
    item_id = add_item(workspace_sessions, run_id, "A?")
    review.review(approve=[item_id])
    review.edit(item_id, "A melhorada?", "Resposta.", None)
    assert review.get(item_id).edited is True
    assert run_counters(workspace_sessions, run_id) == (1, 1, 0)


def test_approve_all_takes_every_remaining_draft_of_a_run(
    workspace_sessions: sessionmaker[Session], review: ReviewService
) -> None:
    run_id = make_run(workspace_sessions)
    other = make_run(workspace_sessions)
    for i in range(3):
        add_item(workspace_sessions, run_id, f"P{i}?")
    add_item(workspace_sessions, other, "Outro?")

    result = review.approve_all(run_id)

    assert result.approved == 3
    assert review.count(run_id=run_id, status="draft") == 0
    assert review.count(run_id=other, status="draft") == 1
