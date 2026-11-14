# Filename: test_study_filter.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import GenerationRun, Item, Material, Topic
from mind.study.scheduler import Rating, Scheduler
from mind.study.service import StudyFilter, StudyService

NOON = datetime(2026, 11, 14, 15, 0, tzinfo=UTC)


class Deck:
    """Two materials, two topics and two card types, with the ids needed by the tests."""

    def __init__(self, sessions: sessionmaker[Session]) -> None:
        with sessions() as session:
            self.cells = Topic(name="Células")
            self.energy = Topic(name="Energia")
            materials = [
                Material(title="Aula 1", kind="pdf", filename="a.pdf", stored_path="a"),
                Material(title="Aula 2", kind="pdf", filename="b.pdf", stored_path="b"),
            ]
            session.add_all([self.cells, self.energy, *materials])
            session.flush()
            self.a, self.b = materials[0].id, materials[1].id
            self.cells_id, self.energy_id = self.cells.id, self.energy.id
            self.ids: dict[str, int] = {}
            plan = [
                ("a-cells-qa", self.a, self.cells_id, "qa", "approved"),
                ("a-energy-cloze", self.a, self.energy_id, "cloze", "approved"),
                ("b-cells-qa", self.b, self.cells_id, "qa", "approved"),
                ("b-energy-qa", self.b, self.energy_id, "qa", "approved"),
                ("b-draft", self.b, self.energy_id, "qa", "draft"),
            ]
            runs: dict[int, int] = {}
            for name, material_id, topic_id, subtype, status in plan:
                if material_id not in runs:
                    run = GenerationRun(
                        kind="card", subtype="qa", model="m", requested=1, material_id=material_id
                    )
                    session.add(run)
                    session.flush()
                    runs[material_id] = run.id
                item = Item(
                    run_id=runs[material_id],
                    kind="card",
                    subtype=subtype,
                    payload_json=json.dumps({"front": f"{name} {{{{c1::x}}}}", "back": ""}),
                    status=status,
                    topic_id=topic_id,
                    approved_at=NOON if status == "approved" else None,
                )
                session.add(item)
                session.flush()
                self.ids[name] = item.id
            session.commit()


@pytest.fixture
def deck(workspace_sessions: sessionmaker[Session]) -> Deck:
    return Deck(workspace_sessions)


@pytest.fixture
def study(workspace_sessions: sessionmaker[Session]) -> StudyService:
    return StudyService(
        workspace_sessions, scheduler=Scheduler(enable_fuzzing=False), clock=lambda: NOON
    )


def fronts(study: StudyService, selection: StudyFilter | None) -> list[str]:
    return [c.item.front.split(" ")[0] for c in study.queue(20, NOON, selection)]


def test_no_filter_studies_every_approved_card(study: StudyService, deck: Deck) -> None:
    assert sorted(fronts(study, None)) == [
        "a-cells-qa",
        "a-energy-cloze",
        "b-cells-qa",
        "b-energy-qa",
    ]
    assert fronts(study, StudyFilter()) == fronts(study, None)
    assert StudyFilter().is_empty


def test_filter_by_topic(study: StudyService, deck: Deck) -> None:
    selection = StudyFilter(topic_id=deck.energy_id)
    assert sorted(fronts(study, selection)) == ["a-energy-cloze", "b-energy-qa"]
    assert study.counts(NOON, selection).new_available == 2


def test_filter_by_material_and_by_card_type(study: StudyService, deck: Deck) -> None:
    assert sorted(fronts(study, StudyFilter(material_id=deck.a))) == [
        "a-cells-qa",
        "a-energy-cloze",
    ]
    assert fronts(study, StudyFilter(subtype="cloze")) == ["a-energy-cloze"]


def test_filters_combine_with_and(study: StudyService, deck: Deck) -> None:
    selection = StudyFilter(material_id=deck.b, topic_id=deck.cells_id, subtype="qa")
    assert fronts(study, selection) == ["b-cells-qa"]
    assert (
        fronts(study, StudyFilter(material_id=deck.a, subtype="cloze", topic_id=deck.cells_id))
        == []
    )


def test_questions_have_no_items_yet_so_that_selection_is_empty(
    study: StudyService, deck: Deck
) -> None:
    selection = StudyFilter(kind="question")
    assert study.queue(20, NOON, selection) == []
    assert study.next_card(NOON, selection) is None
    assert study.counts(NOON, selection).to_study == 0


def test_the_new_card_limit_stays_global_across_filters(study: StudyService, deck: Deck) -> None:
    study.update_settings(new_per_day=2)
    only_cells = StudyFilter(topic_id=deck.cells_id)
    for card in study.queue(2, NOON, only_cells):
        study.rate(card.item.id, Rating.EASY, now=NOON)

    energy = StudyFilter(topic_id=deck.energy_id)
    assert study.counts(NOON, energy).new_available == 0
    assert study.next_card(NOON, energy) is None
    assert study.counts(NOON, only_cells).reviewed_today == 2


def test_reviews_due_today_respect_the_filter_too(study: StudyService, deck: Deck) -> None:
    for name in ("a-cells-qa", "b-energy-qa"):
        study.rate(deck.ids[name], Rating.EASY, now=NOON - timedelta(days=10))
    due = study.counts(NOON, StudyFilter(topic_id=deck.cells_id))
    assert (due.review, due.new_available) == (1, 1)
    assert fronts(study, StudyFilter(topic_id=deck.cells_id))[0] == "a-cells-qa"


def test_facets_list_the_options_with_their_approved_counts(
    study: StudyService, deck: Deck
) -> None:
    facets = study.facets()
    assert [(f.label, f.count) for f in facets.topics] == [("Células", 2), ("Energia", 2)]
    assert [(f.label, f.count) for f in facets.materials] == [("Aula 1", 2), ("Aula 2", 2)]
    assert [(f.key, f.count) for f in facets.subtypes] == [("cloze", 1), ("qa", 3)]
    assert (facets.cards, facets.questions) == (4, 0)


def test_params_carry_only_the_chosen_dimensions() -> None:
    assert StudyFilter().params() == {}
    assert StudyFilter(kind="card", topic_id=3, material_id=4, subtype="qa").params() == {
        "kind": "card",
        "topic": "3",
        "material": "4",
        "subtype": "qa",
    }
