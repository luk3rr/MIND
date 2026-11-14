/*
 * Filename: sm1.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { count, eq, sql } from "drizzle-orm";
import { generationRun } from "./db/workspace-schema.js";
import type { WorkspaceDb } from "./jobs/store.js";

export const TARGET = 0.9;
export const MIN_SAMPLE = 30;

export interface Sm1Report {
  runs: number;
  generated: number;
  discardedAutomatically: number;
  approved: number;
  approvedUnedited: number;
  discardedInReview: number;
  costUsd: number;
}

export type Verdict = "insufficient" | "met" | "not_met";

export const reviewed = (report: Sm1Report): number => report.approved + report.discardedInReview;

/** Approved without edit over reviewed items, or null before any review. */
export function sm1Rate(report: Sm1Report): number | null {
  const total = reviewed(report);
  return total ? report.approvedUnedited / total : null;
}

/** Share of the model's items that survived the automatic source checks. */
export function pipelineYield(report: Sm1Report): number | null {
  const produced = report.generated + report.discardedAutomatically;
  return produced ? report.generated / produced : null;
}

export function costPerApproved(report: Sm1Report): number | null {
  return report.approved ? report.costUsd / report.approved : null;
}

export function verdict(report: Sm1Report): Verdict {
  const rate = sm1Rate(report);
  if (rate === null || reviewed(report) < MIN_SAMPLE) return "insufficient";
  return rate >= TARGET ? "met" : "not_met";
}

export function computeReport(db: WorkspaceDb, kind = "card"): Sm1Report {
  const row = db
    .select({
      runs: count(generationRun.id),
      generated: sql<number>`coalesce(sum(${generationRun.generated}), 0)`,
      discarded: sql<number>`coalesce(sum(${generationRun.discardedNoSource} + ${generationRun.discardedInvalid} + ${generationRun.discardedDuplicate}), 0)`,
      approved: sql<number>`coalesce(sum(${generationRun.approved}), 0)`,
      unedited: sql<number>`coalesce(sum(${generationRun.approvedUnedited}), 0)`,
      review: sql<number>`coalesce(sum(${generationRun.discardedReview}), 0)`,
      cost: sql<number>`coalesce(sum(${generationRun.costUsd}), 0)`,
    })
    .from(generationRun)
    .where(eq(generationRun.kind, kind))
    .get();
  return {
    runs: Number(row?.runs ?? 0),
    generated: Number(row?.generated ?? 0),
    discardedAutomatically: Number(row?.discarded ?? 0),
    approved: Number(row?.approved ?? 0),
    approvedUnedited: Number(row?.unedited ?? 0),
    discardedInReview: Number(row?.review ?? 0),
    costUsd: Number(row?.cost ?? 0),
  };
}

const percent = (value: number | null): string =>
  value === null ? "n/d" : `${(value * 100).toFixed(1)}%`;

export function formatReport(name: string, report: Sm1Report, kind = "card"): string {
  const verdicts: Record<Verdict, string> = {
    met: `META ATINGIDA (≥ ${TARGET * 100}%)`,
    not_met: `META NÃO ATINGIDA (< ${TARGET * 100}%)`,
    insufficient: `AMOSTRA INSUFICIENTE (revise pelo menos ${MIN_SAMPLE} cards)`,
  };
  const perApproved = costPerApproved(report);
  return [
    `SM-1 · workspace: ${name}${kind === "question" ? " · questões" : ""}`,
    `  gerações: ${report.runs}`,
    `  ${kind === "question" ? "questões" : "cards"} gerados (válidos): ${report.generated}`,
    `  descartados automaticamente: ${report.discardedAutomatically} (rendimento do pipeline: ${percent(pipelineYield(report))})`,
    `  revisados: ${reviewed(report)} (aprovados ${report.approved}, descartados ${report.discardedInReview})`,
    `  aprovados sem edição: ${report.approvedUnedited}`,
    `  taxa SM-1: ${percent(sm1Rate(report))}`,
    `  custo: US$ ${report.costUsd.toFixed(4)}${perApproved !== null ? ` (US$ ${perApproved.toFixed(4)} por card aprovado)` : ""}`,
    `  veredito: ${verdicts[verdict(report)]}`,
  ].join("\n");
}
