/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { attempt, generationRun, item } from "../db/workspace-schema.js";
import { ReviewService } from "../review/service.js";
import type { ItemInfo } from "../review/service.js";
import { filterConditions } from "../study/service.js";
import type { StudyFilter } from "../study/service.js";
import { studyDay, systemOffset } from "../study/scheduler.js";
import type { TzOffset } from "../study/scheduler.js";
import { mixKeyOf, pick } from "../study/interleave.js";
import type { MixOptions } from "../study/interleave.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { releaseFor } from "./feedback-policy.js";
import { PracticeSettings } from "./settings.js";

export interface PracticeQuestion {
  item: ItemInfo;
  attempts: number;
  /** Null while the question has never been answered. */
  lastCorrect: boolean | null;
  /** The group of the question in a mixed queue, to continue the rotation from; null otherwise. */
  mixKey: string | null;
}

export interface AnswerResult {
  correct: boolean;
  answer: string;
  correctKey: string;
  explanation: string;
  options: { key: string; text: string; why: string }[];
  attemptId: number;
  /** When the feedback becomes visible; null while it waits for the end of the block. */
  releaseAt: string | null;
  /** True when the feedback is shown together with the answer (the immediate mode). */
  seen: boolean;
}

/** A question as the window sees it before answering: no answer key, comment or quote. */
export interface QuestionView {
  id: number;
  statement: string;
  subtype: string;
  topic: string | null;
  options: { key: string; text: string }[];
}

/** What is revealed about an answer once its feedback is released. */
export interface Feedback {
  attemptId: number;
  itemId: number;
  statement: string;
  correct: boolean;
  answer: string;
  correctKey: string;
  explanation: string;
  options: { key: string; text: string; why: string }[];
  confidence: number | null;
  answeredAt: string;
  sourceTitle: string;
  sourcePage: number | null;
  quote: string;
  pdfSource: ItemInfo["pdfSource"];
}

/** The part of a question the window may see before it is answered. */
export function questionView(info: ItemInfo): QuestionView {
  return {
    id: info.id,
    statement: info.front,
    subtype: info.subtype,
    topic: info.topic,
    options: info.options.map((option) => ({ key: option.key, text: option.text })),
  };
}

export interface PracticeCounts {
  unseen: number;
  retry: number;
  answeredToday: number;
  correctToday: number;
  toPractice: number;
}

interface Last {
  lastId: number;
  correct: boolean;
  attempts: number;
}

/** Answering approved questions, with a queue of unseen and wrongly answered ones. */
export class PracticeService {
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

  private selection(filter?: StudyFilter): StudyFilter {
    return { ...filter, kind: "question" };
  }

  /** Item id to its last attempt id, whether it was correct, and how many attempts it has. */
  private history(): Map<number, Last> {
    const rows = this.db
      .select({ itemId: attempt.itemId, id: attempt.id, correct: attempt.correct })
      .from(attempt)
      .orderBy(asc(attempt.id))
      .all();
    const found = new Map<number, Last>();
    for (const row of rows) {
      const before = found.get(row.itemId);
      found.set(row.itemId, {
        lastId: row.id,
        correct: row.correct,
        attempts: (before?.attempts ?? 0) + 1,
      });
    }
    return found;
  }

  /**
   * Never-answered questions first, then those answered wrongly last time (oldest first). With
   * `redo`, questions answered correctly last time follow (oldest first).
   */
  queue(
    limit = 20,
    filter?: StudyFilter,
    options: { redo?: boolean; exclude?: readonly number[]; mix?: MixOptions } = {},
  ): PracticeQuestion[] {
    const approved = this.db
      .select()
      .from(item)
      .where(and(...filterConditions(this.selection(filter), this.db)))
      .orderBy(asc(item.approvedAt), asc(item.id))
      .all();
    const history = this.history();
    const exclude = new Set(options.exclude ?? []);
    const unseen: (typeof item.$inferSelect)[] = [];
    const wrong: [number, typeof item.$inferSelect][] = [];
    const right: [number, typeof item.$inferSelect][] = [];
    for (const row of approved) {
      if (exclude.has(row.id)) continue;
      const seen = history.get(row.id);
      if (!seen) unseen.push(row);
      else if (!seen.correct) wrong.push([seen.lastId, row]);
      else if (options.redo) right.push([seen.lastId, row]);
    }
    const byAttempt = (a: [number, unknown], b: [number, unknown]): number => a[0] - b[0];
    const sorted = {
      wrong: wrong.sort(byAttempt).map(([, row]) => row),
      right: right.sort(byAttempt).map(([, row]) => row),
    };
    const view = (row: (typeof unseen)[number], mixKey: string | null): PracticeQuestion => ({
      item: this.review.get(row.id),
      attempts: history.get(row.id)?.attempts ?? 0,
      lastCorrect: history.get(row.id)?.correct ?? null,
      mixKey,
    });
    const { mix } = options;
    if (!mix) {
      const ordered = [...unseen, ...sorted.wrong, ...sorted.right];
      return ordered.slice(0, limit).map((row) => view(row, null));
    }
    // A mixed queue keeps the parts in order and rotates the groups inside each of them.
    const materials =
      mix.by === "material"
        ? new Map(
            this.db
              .select({ id: generationRun.id, materialId: generationRun.materialId })
              .from(generationRun)
              .all()
              .map((run) => [run.id, run.materialId]),
          )
        : new Map<number, number | null>();
    const keyed = (row: (typeof unseen)[number]): string =>
      mixKeyOf(mix.by, { topicId: row.topicId, materialId: materials.get(row.runId) ?? null });
    const chosen: PracticeQuestion[] = [];
    let lastKey = mix.afterKey;
    for (const part of [unseen, sorted.wrong, sorted.right]) {
      const pool = [...part];
      while (chosen.length < limit && pool.length > 0) {
        const next = pick(pool, keyed, lastKey) as (typeof pool)[number];
        pool.splice(pool.indexOf(next), 1);
        lastKey = keyed(next);
        chosen.push(view(next, lastKey));
      }
    }
    return chosen;
  }

  nextQuestion(
    filter?: StudyFilter,
    options: { redo?: boolean; exclude?: readonly number[]; mix?: MixOptions } = {},
  ): PracticeQuestion | null {
    return this.queue(1, filter, options)[0] ?? null;
  }

  question(itemId: number): PracticeQuestion {
    const found = this.review.get(itemId);
    if (found.kind !== "question") {
      throw new AppError("ITEM_NOT_FOUND", `Não existe questão com id ${itemId}.`);
    }
    const seen = this.history().get(itemId);
    return {
      item: found,
      attempts: seen?.attempts ?? 0,
      lastCorrect: seen?.correct ?? null,
      mixKey: null,
    };
  }

  counts(filter?: StudyFilter, now: Date = this.clock.now()): PracticeCounts {
    const ids = this.db
      .select({ id: item.id })
      .from(item)
      .where(and(...filterConditions(this.selection(filter), this.db)))
      .all()
      .map((row) => row.id);
    const history = this.history();
    const today = studyDay(now, this.offset);
    const answered =
      this.db.select({ total: count() }).from(attempt).where(eq(attempt.day, today)).get()?.total ??
      0;
    const correct =
      this.db
        .select({ total: count() })
        .from(attempt)
        .where(and(eq(attempt.day, today), eq(attempt.correct, true)))
        .get()?.total ?? 0;
    const unseen = ids.filter((id) => !history.has(id)).length;
    const retry = ids.filter((id) => history.get(id)?.correct === false).length;
    return {
      unseen,
      retry,
      answeredToday: answered,
      correctToday: correct,
      toPractice: unseen + retry,
    };
  }

  answer(
    itemId: number,
    answer: string,
    options: { seconds?: number; now?: Date } = {},
  ): AnswerResult {
    const moment = options.now ?? this.clock.now();
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row || row.kind !== "question") {
      throw new AppError("ITEM_NOT_FOUND", `Não existe questão com id ${itemId}.`);
    }
    if (row.status !== "approved") {
      throw new AppError("VALIDATION_ERROR", "Só questões aprovadas podem ser respondidas.");
    }
    const payload = JSON.parse(row.payloadJson) as {
      options: { key: string; text: string; why: string }[];
      answer: string;
      explanation: string;
    };
    const keys = payload.options.map((o) => o.key);
    if (!keys.includes(answer)) {
      throw new AppError("VALIDATION_ERROR", "Escolha uma das alternativas.", [
        { field: "answer", message: `Use uma destas: ${keys.join(", ")}.` },
      ]);
    }
    const correct = answer === payload.answer;
    const release = releaseFor(new PracticeSettings(this.workspace).get().feedback, moment);
    const created = this.db
      .insert(attempt)
      .values({
        itemId,
        answer,
        correct,
        seconds: options.seconds ?? null,
        answeredAt: moment.toISOString(),
        day: studyDay(moment, this.offset),
        releaseAt: release.releaseAt,
        seenAt: release.seen ? release.releaseAt : null,
      })
      .returning()
      .get();
    return {
      correct,
      answer,
      correctKey: payload.answer,
      explanation: payload.explanation,
      options: payload.options,
      attemptId: created.id,
      releaseAt: release.releaseAt,
      seen: release.seen,
    };
  }

  /** The feedback of the given answers, in the order asked; an unknown answer is refused. */
  feedback(attemptIds: readonly number[]): Feedback[] {
    const rows = this.db
      .select()
      .from(attempt)
      .where(inArray(attempt.id, [...attemptIds]))
      .all();
    const byId = new Map(rows.map((row) => [row.id, row]));
    return attemptIds.map((id) => {
      const row = byId.get(id);
      if (!row) {
        throw new AppError("VALIDATION_ERROR", "Resposta não encontrada.", [
          { field: "attemptIds", message: `Não existe resposta com id ${id}.` },
        ]);
      }
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
  }

  /**
   * Releases the feedback of a block: the given answers that were waiting become visible and are
   * marked as seen, and their feedback is returned in the order asked.
   */
  releaseBlock(attemptIds: readonly number[], now: Date = this.clock.now()): Feedback[] {
    const entries = this.feedback(attemptIds);
    const moment = now.toISOString();
    this.workspace.connection.sqlite.transaction(() => {
      this.db
        .update(attempt)
        .set({ releaseAt: moment })
        .where(and(inArray(attempt.id, [...attemptIds]), isNull(attempt.releaseAt)))
        .run();
      this.db
        .update(attempt)
        .set({ seenAt: moment })
        .where(and(inArray(attempt.id, [...attemptIds]), isNull(attempt.seenAt)))
        .run();
    })();
    return entries;
  }
}
