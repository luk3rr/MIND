# Filename: test_sm1_script.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from pathlib import Path

import pytest

from mind import __main__ as cli
from mind.config import Settings
from mind.db.workspace_models import GenerationRun
from mind.sm1 import MIN_SAMPLE, Sm1Report, compute_report, format_report
from mind.workspaces.registry import WorkspaceRegistry


def report(**kwargs: float) -> Sm1Report:
    base = {
        "runs": 1,
        "generated": 40,
        "discarded_automatically": 10,
        "approved": 36,
        "approved_unedited": 34,
        "discarded_in_review": 4,
        "cost_usd": 0.4,
    }
    return Sm1Report(**{**base, **kwargs})  # type: ignore[arg-type]


def test_rates_are_computed_over_reviewed_items() -> None:
    result = report()
    assert result.reviewed == 40
    assert result.sm1_rate == pytest.approx(34 / 40)
    assert result.pipeline_yield == pytest.approx(40 / 50)
    assert result.cost_per_approved == pytest.approx(0.4 / 36)


def test_verdicts_depend_on_sample_size_and_target() -> None:
    assert report().verdict == "not_met"  # 85% on 40 reviewed
    assert report(approved_unedited=36, approved=36, discarded_in_review=2).verdict == "met"
    assert (
        report(approved=10, approved_unedited=10, discarded_in_review=0).verdict == "insufficient"
    )
    assert report(approved=0, approved_unedited=0, discarded_in_review=0).verdict == "insufficient"
    assert MIN_SAMPLE == 30


def test_empty_report_has_no_rates() -> None:
    empty = Sm1Report(0, 0, 0, 0, 0, 0, 0.0)
    assert (empty.sm1_rate, empty.pipeline_yield, empty.cost_per_approved) == (None, None, None)
    assert "n/d" in format_report("Vazio", empty)


def test_format_shows_every_figure_and_the_verdict() -> None:
    text = format_report("Biologia", report())
    assert "workspace: Biologia" in text
    assert "taxa SM-1: 85.0%" in text
    assert "rendimento do pipeline: 80.0%" in text
    assert "META NÃO ATINGIDA" in text
    assert "por card aprovado" in text


def test_compute_report_sums_card_runs_and_ignores_other_kinds(tmp_path: Path) -> None:
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path))
    try:
        sessions = registry.open(registry.create("W").id).sessions
        with sessions() as session:
            session.add_all(
                [
                    GenerationRun(
                        kind="card", subtype="qa", model="m", requested=10, generated=8,
                        discarded_no_source=1, discarded_invalid=1, approved=6,
                        approved_unedited=5, discarded_review=2, cost_usd=0.1,
                    ),
                    GenerationRun(
                        kind="card", subtype="cloze", model="m", requested=10, generated=9,
                        discarded_duplicate=1, approved=9, approved_unedited=9, cost_usd=0.2,
                    ),
                    GenerationRun(
                        kind="question", subtype="tf", model="m", requested=5, approved=5
                    ),
                ]
            )  # fmt: skip
            session.commit()
        result = compute_report(sessions)
    finally:
        registry.close()
    assert (result.runs, result.generated, result.discarded_automatically) == (2, 17, 3)
    assert (result.approved, result.approved_unedited, result.discarded_in_review) == (15, 14, 2)
    assert result.cost_usd == pytest.approx(0.3)


def test_the_sm1_command_prints_a_report_per_workspace(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path / "data"))
    registry.create("Biologia")
    registry.create("Física")
    registry.close()

    cli.main(["sm1", "--data-dir", str(tmp_path / "data")])
    both = capsys.readouterr().out
    assert "workspace: Biologia" in both
    assert "workspace: Física" in both

    cli.main(["sm1", "--data-dir", str(tmp_path / "data"), "--workspace", "2"])
    only = capsys.readouterr().out
    assert "Física" in only
    assert "Biologia" not in only


def test_the_sm1_command_handles_an_empty_installation(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    cli.main(["sm1", "--data-dir", str(tmp_path / "data")])
    assert "Nenhum workspace" in capsys.readouterr().out


def test_the_kind_flag_reports_on_questions(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    registry = WorkspaceRegistry(Settings(data_dir=tmp_path / "data"))
    sessions = registry.open(registry.create("Quest").id).sessions
    with sessions() as session:
        session.add(
            GenerationRun(
                kind="question", subtype="certo_errado", model="m", requested=5, generated=5,
                approved=4, approved_unedited=4, discarded_review=1, cost_usd=0.05,
            )
        )  # fmt: skip
        session.add(
            GenerationRun(
                kind="card", subtype="qa", model="m", requested=5, generated=9, approved=9
            )
        )
        session.commit()
    registry.close()

    cli.main(["sm1", "--kind", "question", "--data-dir", str(tmp_path / "data")])
    out = capsys.readouterr().out
    assert "· questões" in out
    assert "questões gerados (válidos): 5" in out
    assert "taxa SM-1: 80.0%" in out
