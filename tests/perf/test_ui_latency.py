# Filename: test_ui_latency.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
import statistics
import time
from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from mind.clock import utcnow
from mind.db.workspace_models import CardState, GenerationRun, Item
from mind.study.scheduler import Rating, Scheduler
from mind.workspaces.registry import WorkspaceRegistry

CARDS = 1000
SAMPLES = 60
P95_LIMIT_SECONDS = 0.3


def p95(samples: list[float]) -> float:
    return statistics.quantiles(samples, n=20)[-1]


def measure(call: Callable[[], object]) -> float:
    durations = []
    for _ in range(SAMPLES):
        started = time.perf_counter()
        call()
        durations.append(time.perf_counter() - started)
    return p95(durations)


def seed(client: TestClient, workspace_id: int) -> None:
    registry: WorkspaceRegistry = client.app.state.registry  # type: ignore[attr-defined]
    sessions = registry.open(workspace_id).sessions
    scheduler = Scheduler(enable_fuzzing=False)
    now = utcnow()
    with sessions() as session:
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=CARDS)
        session.add(run)
        session.flush()
        for number in range(CARDS):
            item = Item(
                run_id=run.id,
                kind="card",
                subtype="qa",
                payload_json=json.dumps({"front": f"Pergunta {number}?", "back": "Resposta."}),
                status="approved",
                approved_at=now,
                source_title="Aula",
            )
            session.add(item)
            session.flush()
            if number % 2 == 0:  # half of the cards already have a schedule, spread over time
                state = scheduler.review(None, Rating.EASY, now - timedelta(days=number % 20))
                session.add(
                    CardState(
                        item_id=item.id,
                        fsrs_json=state.fsrs_json,
                        due=state.due,
                        state=state.state,
                        reps=state.reps,
                        lapses=state.lapses,
                    )
                )
        session.commit()


@pytest.mark.perf
def test_study_screens_stay_under_300_ms_at_p95_with_1000_cards(ready: TestClient) -> None:
    workspace_id = int(ready.post("/api/v1/workspaces", json={"name": "Perf"}).json()["id"])
    seed(ready, workspace_id)
    htmx = {"hx-request": "true"}

    today = measure(lambda: ready.get(f"/w/{workspace_id}/today"))
    study = measure(lambda: ready.get(f"/w/{workspace_id}/study"))
    queue = measure(lambda: ready.get(f"/api/v1/workspaces/{workspace_id}/study/queue"))
    counter = iter(range(1, CARDS * 2))

    def rate_next() -> None:
        card = ready.get(
            f"/api/v1/workspaces/{workspace_id}/study/queue", params={"limit": 1}
        ).json()
        ready.post(
            f"/w/{workspace_id}/study/rate",
            data={"item_id": str(card[0]["item"]["id"]), "rating": "3"},
            headers=htmx,
        )
        next(counter)

    rating = measure(rate_next)
    print(
        f"\np95 with {CARDS} cards: today={today * 1000:.0f} ms, study={study * 1000:.0f} ms, "
        f"queue={queue * 1000:.0f} ms, queue+rate={rating * 1000:.0f} ms"
    )
    for name, value in (("today", today), ("study", study), ("queue", queue), ("rate", rating)):
        assert value < P95_LIMIT_SECONDS, f"{name} p95 is {value * 1000:.0f} ms"
