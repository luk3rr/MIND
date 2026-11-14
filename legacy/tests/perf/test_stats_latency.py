# Filename: test_stats_latency.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import json
import statistics
import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from mind.clock import utcnow
from mind.db.workspace_models import Attempt, GenerationRun, Item, ReviewLog, Topic
from mind.workspaces.registry import WorkspaceRegistry

REVIEWS = 5000
ATTEMPTS = 1500
ITEMS = 300
SAMPLES = 40
P95_LIMIT_SECONDS = 0.3


def seed(client: TestClient, workspace_id: int) -> None:
    registry: WorkspaceRegistry = client.app.state.registry  # type: ignore[attr-defined]
    sessions = registry.open(workspace_id).sessions
    now = utcnow()
    with sessions() as session:
        topics = [Topic(name=f"Tópico {n}") for n in range(20)]
        run = GenerationRun(kind="card", subtype="qa", model="m", requested=ITEMS)
        session.add_all([run, *topics])
        session.flush()
        items = []
        for number in range(ITEMS):
            kind = "question" if number % 4 == 0 else "card"
            item = Item(
                run_id=run.id,
                kind=kind,
                subtype="qa",
                payload_json=json.dumps({}),
                status="approved",
                topic_id=topics[number % len(topics)].id,
            )
            session.add(item)
            items.append(item)
        session.flush()
        cards = [i for i in items if i.kind == "card"]
        questions = [i for i in items if i.kind == "question"]
        for number in range(REVIEWS):
            moment = now - timedelta(days=number % 90)
            session.add(
                ReviewLog(
                    item_id=cards[number % len(cards)].id,
                    rating=1 + number % 4,
                    reviewed_at=moment,
                    day=moment.date().isoformat(),
                    previous_state_json=json.dumps({"state": 2}),
                )
            )
        for number in range(ATTEMPTS):
            moment = now - timedelta(days=number % 90)
            session.add(
                Attempt(
                    item_id=questions[number % len(questions)].id,
                    answer="A",
                    correct=number % 3 != 0,
                    answered_at=moment,
                    day=moment.date().isoformat(),
                )
            )
        session.commit()


@pytest.mark.perf
def test_the_statistics_page_and_api_stay_under_300_ms_at_p95(ready: TestClient) -> None:
    workspace_id = int(ready.post("/api/v1/workspaces", json={"name": "Perf"}).json()["id"])
    seed(ready, workspace_id)

    def p95(path: str) -> float:
        durations = []
        for _ in range(SAMPLES):
            started = time.perf_counter()
            assert ready.get(path).status_code == 200
            durations.append(time.perf_counter() - started)
        return statistics.quantiles(durations, n=20)[-1]

    page = p95(f"/w/{workspace_id}/stats")
    topics = p95(f"/api/v1/workspaces/{workspace_id}/stats/topics")
    retention = p95(f"/api/v1/workspaces/{workspace_id}/stats/retention")
    print(
        f"\np95 with {REVIEWS} reviews and {ATTEMPTS} attempts: page={page * 1000:.0f} ms, "
        f"topics={topics * 1000:.0f} ms, retention={retention * 1000:.0f} ms"
    )
    for name, value in (("page", page), ("topics", topics), ("retention", retention)):
        assert value < P95_LIMIT_SECONDS, f"{name} p95 is {value * 1000:.0f} ms"
