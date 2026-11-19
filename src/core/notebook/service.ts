/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, count, eq, inArray, isNull, max, or } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { attempt, generationRun, item, reviewLog, topic } from "../db/workspace-schema.js";
import { pdfSourceOf } from "../reader/source.js";
import type { PdfSource } from "../reader/source.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export const NOTEBOOK_KIND = "notebook";
export const ERROR_NOTE = "error_note";

export interface CardCreated {
  itemId: number;
  /** False when the card already existed. */
  created: boolean;
}

export interface ErrorEntry {
  itemId: number;
  front: string;
  topic: string | null;
  sourceTitle: string;
  sourcePage: number | null;
  fromQuestion: boolean;
  pdfSource: PdfSource | null;
  /** Times the card was rated "Errei". */
  failures: number;
  lastErrorAt: string;
}

export interface ErrorCounts {
  total: number;
  fromQuestions: number;
  failedCards: number;
}

interface QuestionPayload {
  statement: string;
  explanation: string;
  answer: string;
  options: { key: string; text: string; why: string }[];
}

/** The card subtype, front and back of the card that revisits a missed question. */
export function errorCardText(
  subtype: string,
  payload: QuestionPayload,
): [subtype: string, front: string, back: string] {
  const statement = payload.statement.trim();
  const explanation = payload.explanation.trim();
  if (subtype === "certo_errado") {
    const verdict = payload.answer === "C" ? "Verdadeiro" : "Falso";
    return ["true_false", statement, `${verdict}. ${explanation}`];
  }
  const listing = payload.options.map((o) => `${o.key}) ${o.text}`).join("\n");
  const right = payload.options.find((o) => o.key === payload.answer)?.text ?? "";
  return [
    "qa",
    `${statement}\n\n${listing}`,
    `Resposta: ${payload.answer}) ${right}\n\n${explanation}`,
  ];
}

/** Turns mistakes into cards and lists everything the user got wrong. */
export class ErrorNotebook {
  private readonly clock: Clock;

  constructor(
    private readonly workspace: OpenWorkspace,
    clock: Clock = systemClock,
  ) {
    this.clock = clock;
  }

  private get db() {
    return this.workspace.connection.db;
  }

  /** The synthetic run of the cards of a material (the material of an item is its run's). */
  private runId(materialId: number | null): number {
    const found = this.db
      .select({ id: generationRun.id })
      .from(generationRun)
      .where(
        and(
          eq(generationRun.kind, NOTEBOOK_KIND),
          materialId === null
            ? isNull(generationRun.materialId)
            : eq(generationRun.materialId, materialId),
        ),
      )
      .limit(1)
      .get();
    if (found) return found.id;
    return this.db
      .insert(generationRun)
      .values({
        kind: NOTEBOOK_KIND,
        subtype: ERROR_NOTE,
        materialId,
        model: "-",
        requested: 0,
        status: "done",
        finishedAt: this.clock.now().toISOString(),
      })
      .returning({ id: generationRun.id })
      .get().id;
  }

  /** The id of the error card already made from this question, if any. */
  cardFor(questionId: number): number | null {
    return (
      this.db
        .select({ id: item.id })
        .from(item)
        .where(eq(item.originItemId, questionId))
        .limit(1)
        .get()?.id ?? null
    );
  }

  /** Creates (once) the approved card that revisits a question answered wrongly. */
  createCard(questionId: number): CardCreated {
    const question = this.db.select().from(item).where(eq(item.id, questionId)).get();
    if (!question || question.kind !== "question") {
      throw new AppError("ITEM_NOT_FOUND", `Não existe questão com id ${questionId}.`);
    }
    if (question.status !== "approved") {
      throw new AppError("VALIDATION_ERROR", "Só questões aprovadas têm caderno de erros.");
    }
    const existing = this.cardFor(questionId);
    if (existing !== null) return { itemId: existing, created: false };
    const missed =
      this.db
        .select({ total: count() })
        .from(attempt)
        .where(and(eq(attempt.itemId, questionId), eq(attempt.correct, false)))
        .get()?.total ?? 0;
    if (!missed) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Só é possível virar card uma questão que você errou.",
      );
    }
    const [subtype, front, back] = errorCardText(
      question.subtype,
      JSON.parse(question.payloadJson) as QuestionPayload,
    );
    const now = this.clock.now().toISOString();
    const card = this.db
      .insert(item)
      .values({
        runId: this.runId(
          this.db
            .select({ id: generationRun.materialId })
            .from(generationRun)
            .where(eq(generationRun.id, question.runId))
            .get()?.id ?? null,
        ),
        kind: "card",
        subtype,
        payloadJson: JSON.stringify({ front, back }),
        status: "approved",
        topicId: question.topicId,
        chunkId: question.chunkId,
        sourceTitle: question.sourceTitle,
        sourcePage: question.sourcePage,
        quote: question.quote,
        origin: ERROR_NOTE,
        originItemId: questionId,
        createdAt: now,
        approvedAt: now,
      })
      .returning({ id: item.id })
      .get();
    return { itemId: card.id, created: true };
  }

  /** Error cards from questions plus cards rated "Errei" at least once, newest first. */
  entries(topicId?: number): ErrorEntry[] {
    const failures = new Map(
      this.db
        .select({ itemId: reviewLog.itemId, total: count(), last: max(reviewLog.reviewedAt) })
        .from(reviewLog)
        .where(eq(reviewLog.rating, 1))
        .groupBy(reviewLog.itemId)
        .all()
        .map((row) => [row.itemId, { count: row.total, last: row.last }] as const),
    );
    const failed = [...failures.keys()];
    const rows = this.db
      .select({ row: item, topicName: topic.name })
      .from(item)
      .leftJoin(topic, eq(topic.id, item.topicId))
      .where(
        and(
          eq(item.kind, "card"),
          eq(item.status, "approved"),
          or(eq(item.origin, ERROR_NOTE), failed.length ? inArray(item.id, failed) : undefined),
          topicId !== undefined ? eq(item.topicId, topicId) : undefined,
        ),
      )
      .all();
    return rows
      .map(({ row, topicName }): ErrorEntry => {
        const seen = failures.get(row.id);
        return {
          itemId: row.id,
          front: String((JSON.parse(row.payloadJson) as { front?: string }).front ?? ""),
          topic: topicName,
          sourceTitle: row.sourceTitle,
          sourcePage: row.sourcePage,
          fromQuestion: row.origin === ERROR_NOTE,
          pdfSource: pdfSourceOf(this.db, row.chunkId, row.sourcePage, row.quote),
          failures: seen?.count ?? 0,
          lastErrorAt: seen?.last ?? row.createdAt,
        };
      })
      .sort((a, b) =>
        a.lastErrorAt === b.lastErrorAt
          ? b.itemId - a.itemId
          : a.lastErrorAt < b.lastErrorAt
            ? 1
            : -1,
      );
  }

  counts(): ErrorCounts {
    const all = this.entries();
    return {
      total: all.length,
      fromQuestions: all.filter((e) => e.fromQuestion).length,
      failedCards: all.filter((e) => e.failures > 0).length,
    };
  }
}
