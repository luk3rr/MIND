# Filename: sm1.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""SM-1 report: how many reviewed items were approved without any edit (NFR-8)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from mind.db.workspace_models import GenerationRun

TARGET = 0.90
MIN_SAMPLE = 30


@dataclass(frozen=True)
class Sm1Report:
    runs: int
    generated: int
    discarded_automatically: int
    approved: int
    approved_unedited: int
    discarded_in_review: int
    cost_usd: float

    @property
    def reviewed(self) -> int:
        return self.approved + self.discarded_in_review

    @property
    def sm1_rate(self) -> float | None:
        """Approved without edit over reviewed items, or `None` before any review."""
        return self.approved_unedited / self.reviewed if self.reviewed else None

    @property
    def pipeline_yield(self) -> float | None:
        """Share of the model's cards that survived the automatic source checks."""
        produced = self.generated + self.discarded_automatically
        return self.generated / produced if produced else None

    @property
    def cost_per_approved(self) -> float | None:
        return self.cost_usd / self.approved if self.approved else None

    @property
    def verdict(self) -> str:
        """One of `insufficient`, `met` or `not_met`."""
        rate = self.sm1_rate
        if rate is None or self.reviewed < MIN_SAMPLE:
            return "insufficient"
        return "met" if rate >= TARGET else "not_met"


def compute_report(sessions: sessionmaker[Session], *, kind: str = "card") -> Sm1Report:
    with sessions() as session:
        row = session.execute(
            select(
                func.count(GenerationRun.id),
                func.coalesce(func.sum(GenerationRun.generated), 0),
                func.coalesce(
                    func.sum(
                        GenerationRun.discarded_no_source
                        + GenerationRun.discarded_invalid
                        + GenerationRun.discarded_duplicate
                    ),
                    0,
                ),
                func.coalesce(func.sum(GenerationRun.approved), 0),
                func.coalesce(func.sum(GenerationRun.approved_unedited), 0),
                func.coalesce(func.sum(GenerationRun.discarded_review), 0),
                func.coalesce(func.sum(GenerationRun.cost_usd), 0.0),
            ).where(GenerationRun.kind == kind)
        ).one()
    return Sm1Report(
        runs=int(row[0]),
        generated=int(row[1]),
        discarded_automatically=int(row[2]),
        approved=int(row[3]),
        approved_unedited=int(row[4]),
        discarded_in_review=int(row[5]),
        cost_usd=float(row[6]),
    )


def _percent(value: float | None) -> str:
    return "n/d" if value is None else f"{value * 100:.1f}%"


def format_report(name: str, report: Sm1Report) -> str:
    verdicts = {
        "met": f"META ATINGIDA (≥ {TARGET * 100:.0f}%)",
        "not_met": f"META NÃO ATINGIDA (< {TARGET * 100:.0f}%)",
        "insufficient": f"AMOSTRA INSUFICIENTE (revise pelo menos {MIN_SAMPLE} cards)",
    }
    per_approved = report.cost_per_approved
    lines = [
        f"SM-1 · workspace: {name}",
        f"  gerações: {report.runs}",
        f"  cards gerados (válidos): {report.generated}",
        f"  descartados automaticamente: {report.discarded_automatically}"
        f" (rendimento do pipeline: {_percent(report.pipeline_yield)})",
        f"  revisados: {report.reviewed} (aprovados {report.approved},"
        f" descartados {report.discarded_in_review})",
        f"  aprovados sem edição: {report.approved_unedited}",
        f"  taxa SM-1: {_percent(report.sm1_rate)}",
        f"  custo: US$ {report.cost_usd:.4f}"
        + (f" (US$ {per_approved:.4f} por card aprovado)" if per_approved is not None else ""),
        f"  veredito: {verdicts[report.verdict]}",
    ]
    return "\n".join(lines)
