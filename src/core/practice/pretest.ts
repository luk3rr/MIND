/*
 * Filename: pretest.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { attempt, generationRun, item, material, pretestAttempt } from "../db/workspace-schema.js";
import { ReviewService } from "../review/service.js";
import { studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { questionView } from "./service.js";
import type { Feedback, QuestionView } from "./service.js";
import { PracticeSettings } from "./settings.js";

/** The most questions one pre-test round can have. */
export const MAX_ROUND = 20;

export interface PretestRound {
  roundId: string;
  questions: QuestionView[];
  /** How many questions of the material could have been asked. */
  available: number;
}

export interface PretestSummary {
  total: number;
  correct: number;
  entries: Feedback[];
}

/**
 * Pre-test rounds: questions of a material answered before studying it. Answers are kept in
 * `pretest_attempt`, so nothing here ever counts as practice.
 */
export class PretestService {
  private readonly review: ReviewService;
  private readonly clock: Clock;
  private readonly offset: TzOffset;

  constructor(
    private readonly workspace: OpenWorkspace,
    options: { clock?: Clock; offset?: TzOffset } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.offset = options.offset ?? systemOffset;
    this.review = new ReviewService(workspace, this.clock);
  }

  private get db() {
    return this.workspace.connection.db;
  }

  /**
   * Approved questions of the material the student never answered in practice; those that did
   * not appear in any round come first, then by approval order.
   */
  eligible(materialId: number): number[] {
    const rows = this.db
      .select({ id: item.id })
      .from(item)
      .where(
        and(
          eq(item.kind, "question"),
          eq(item.status, "approved"),
          inArray(
            item.runId,
            this.db
              .select({ id: generationRun.id })
              .from(generationRun)
              .where(eq(generationRun.materialId, materialId)),
          ),
          notInArray(item.id, this.db.select({ id: attempt.itemId }).from(attempt)),
        ),
      )
      .orderBy(asc(item.approvedAt), asc(item.id))
      .all()
      .map((row) => row.id);
    const asked = new Set(
      this.db
        .select({ id: pretestAttempt.itemId })
        .from(pretestAttempt)
        .all()
        .map((r) => r.id),
    );
    return [...rows.filter((id) => !asked.has(id)), ...rows.filter((id) => asked.has(id))];
  }

  /** How many questions of the material a round could use. */
  eligibleCount(materialId: number): number {
    return this.eligible(materialId).length;
  }

  start(materialId: number, count: number): PretestRound {
    if (!this.db.select().from(material).where(eq(material.id, materialId)).get()) {
      throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${materialId}.`);
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_ROUND) {
      throw new AppError("VALIDATION_ERROR", `Use de 1 a ${MAX_ROUND} questões.`, [
        { field: "count", message: `Use de 1 a ${MAX_ROUND}.` },
      ]);
    }
    const ids = this.eligible(materialId);
    if (ids.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Este material não tem questões para um pré-teste.", [
        { field: "count", message: "Gere e aprove questões deste material primeiro." },
      ]);
    }
    return {
      roundId: randomUUID(),
      questions: ids.slice(0, count).map((id) => questionView(this.review.get(id))),
      available: ids.length,
    };
  }

  /** Records an answer of a round without telling whether it was right. */
  answer(
    roundId: string,
    itemId: number,
    answer: string,
    options: { seconds?: number; confidence?: number } = {},
  ): void {
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row || row.kind !== "question" || row.status !== "approved") {
      throw new AppError("ITEM_NOT_FOUND", `Não existe questão com id ${itemId}.`);
    }
    const info = this.review.get(itemId);
    if (!info.options.some((option) => option.key === answer)) {
      throw new AppError("VALIDATION_ERROR", "Escolha uma das alternativas.", [
        {
          field: "answer",
          message: `Use uma destas: ${info.options.map((o) => o.key).join(", ")}.`,
        },
      ]);
    }
    const asked = new PracticeSettings(this.workspace).get().confidence;
    const level = options.confidence;
    if (level === undefined ? asked : !Number.isInteger(level) || level < 1 || level > 3) {
      throw new AppError("VALIDATION_ERROR", "Informe o quanto você está seguro.", [
        { field: "confidence", message: "Escolha chute, acho que sei ou tenho certeza." },
      ]);
    }
    const moment = this.clock.now();
    this.db
      .insert(pretestAttempt)
      .values({
        itemId,
        roundId,
        answer,
        correct: answer === info.answer,
        confidence: level ?? null,
        seconds: options.seconds ?? null,
        answeredAt: moment.toISOString(),
        day: studyDay(moment, this.offset),
      })
      .run();
  }

  /** The score and the feedback of a round, once the student is done. */
  summary(roundId: string): PretestSummary {
    const rows = this.db
      .select()
      .from(pretestAttempt)
      .where(eq(pretestAttempt.roundId, roundId))
      .orderBy(asc(pretestAttempt.id))
      .all();
    if (rows.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Rodada não encontrada.", [
        { field: "roundId", message: "Não há respostas nesta rodada." },
      ]);
    }
    const entries = rows.map((row): Feedback => {
      const info = this.review.get(row.itemId);
      return {
        attemptId: row.id,
        itemId: row.itemId,
        statement: info.front,
        correct: row.correct,
        answer: row.answer,
        correctKey: info.answer ?? "",
        explanation: info.back,
        options: info.options,
        confidence: row.confidence,
        answeredAt: row.answeredAt,
        sourceTitle: info.sourceTitle,
        sourcePage: info.sourcePage,
        quote: info.quote,
        pdfSource: info.pdfSource,
      };
    });
    return { total: entries.length, correct: entries.filter((e) => e.correct).length, entries };
  }
}
