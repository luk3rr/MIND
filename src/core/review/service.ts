/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, eq, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { chunk, generationRun, item, topic } from "../db/workspace-schema.js";
import { cleanTopic, payloadProblem } from "../generation/cards.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

const FRONT_PROBLEMS = new Set(["empty_front", "empty_statement", "cloze_without_gap"]);
const PROBLEM_MESSAGES: Record<string, string> = {
  empty_front: "A frente do card não pode ficar vazia.",
  empty_back: "O verso do card não pode ficar vazio.",
  cloze_without_gap: "Um card de lacuna precisa de {{c1::termo}} na frente.",
  true_false_without_verdict: "O verso deve começar por Verdadeiro ou Falso.",
  empty_statement: "O enunciado da questão não pode ficar vazio.",
  empty_explanation: "O comentário da questão não pode ficar vazio.",
};

export interface ItemInfo {
  id: number;
  runId: number;
  kind: string;
  subtype: string;
  front: string;
  back: string;
  status: string;
  topic: string | null;
  sourceTitle: string;
  sourcePage: number | null;
  quote: string;
  chunkId: number | null;
  edited: boolean;
  origin: string;
  createdAt: string;
  approvedAt: string | null;
  options: { key: string; text: string; why: string }[];
  answer: string | null;
}

export interface ReviewResult {
  approved: number;
  discarded: number;
  skipped: number;
}

export interface ListOptions {
  runId?: number;
  status?: string;
  kind?: string;
  limit?: number;
  offset?: number;
}

type Row = { item: typeof item.$inferSelect; topic: string | null };

/** Lists, edits, approves and discards the generated items of one workspace. */
export class ReviewService {
  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly clock: Clock = systemClock,
  ) {}

  private get db() {
    return this.workspace.connection.db;
  }

  private static info({ item: row, topic: topicName }: Row): ItemInfo {
    const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
    const isQuestion = row.kind === "question";
    return {
      id: row.id,
      runId: row.runId,
      kind: row.kind,
      subtype: row.subtype,
      front: String(payload[isQuestion ? "statement" : "front"] ?? ""),
      back: String(payload[isQuestion ? "explanation" : "back"] ?? ""),
      status: row.status,
      topic: topicName,
      sourceTitle: row.sourceTitle,
      sourcePage: row.sourcePage,
      quote: row.quote,
      chunkId: row.chunkId,
      edited: row.edited,
      origin: row.origin,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      options: isQuestion ? ((payload["options"] as ItemInfo["options"] | undefined) ?? []) : [],
      answer: isQuestion ? String(payload["answer"] ?? "") : null,
    };
  }

  private filters(options: ListOptions) {
    const clauses = [];
    if (options.runId !== undefined) clauses.push(eq(item.runId, options.runId));
    if (options.status !== undefined) clauses.push(eq(item.status, options.status));
    if (options.kind !== undefined) clauses.push(eq(item.kind, options.kind));
    return clauses.length > 0 ? and(...clauses) : undefined;
  }

  list(options: ListOptions = {}): ItemInfo[] {
    return this.db
      .select({ item, topic: topic.name })
      .from(item)
      .leftJoin(topic, eq(topic.id, item.topicId))
      .where(this.filters(options))
      .orderBy(asc(item.id))
      .limit(options.limit ?? 200)
      .offset(options.offset ?? 0)
      .all()
      .map((row) => ReviewService.info(row));
  }

  count(options: ListOptions = {}): number {
    return (
      this.db.select({ total: count() }).from(item).where(this.filters(options)).get()?.total ?? 0
    );
  }

  get(itemId: number): ItemInfo {
    const row = this.db
      .select({ item, topic: topic.name })
      .from(item)
      .leftJoin(topic, eq(topic.id, item.topicId))
      .where(eq(item.id, itemId))
      .get();
    if (!row) throw new AppError("ITEM_NOT_FOUND", `Não existe item com id ${itemId}.`);
    return ReviewService.info(row);
  }

  /** Text of the source chunk, or null when the chunk no longer exists. */
  sourceText(chunkId: number | null): string | null {
    if (chunkId === null) return null;
    return this.db.select().from(chunk).where(eq(chunk.id, chunkId)).get()?.text ?? null;
  }

  /** Changes the text and topic of a draft or approved item; the source is kept. */
  edit(itemId: number, front: string, back: string, topicName: string | null): ItemInfo {
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row) throw new AppError("ITEM_NOT_FOUND", `Não existe item com id ${itemId}.`);
    if (row.status === "discarded") {
      throw new AppError("VALIDATION_ERROR", "Itens descartados não podem ser editados.");
    }
    const isQuestion = row.kind === "question";
    let problem: string | null;
    if (isQuestion) {
      problem = !front.trim() ? "empty_statement" : !back.trim() ? "empty_explanation" : null;
    } else {
      problem = payloadProblem(row.subtype, front, back);
    }
    if (problem !== null) {
      const message = PROBLEM_MESSAGES[problem] ?? "Texto inválido.";
      throw new AppError("VALIDATION_ERROR", message, [
        { field: FRONT_PROBLEMS.has(problem) ? "front" : "back", message },
      ]);
    }
    const [frontKey, backKey] = isQuestion ? ["statement", "explanation"] : ["front", "back"];
    const old = JSON.parse(row.payloadJson) as Record<string, unknown>;
    const next = { ...old, [frontKey as string]: front.trim(), [backKey as string]: back.trim() };
    const changed = JSON.stringify(next) !== JSON.stringify(old);
    this.workspace.connection.sqlite.transaction(() => {
      this.db
        .update(item)
        .set({
          ...(changed ? { payloadJson: JSON.stringify(next), edited: true } : {}),
          topicId: this.topicId(cleanTopic(topicName)),
        })
        .where(eq(item.id, itemId))
        .run();
    })();
    return this.get(itemId);
  }

  private topicId(name: string | null): number | null {
    if (name === null) return null;
    const found = this.db
      .select()
      .from(topic)
      .where(sql`lower(${topic.name}) = ${name.toLowerCase()}`)
      .get();
    return found?.id ?? this.db.insert(topic).values({ name }).returning().get().id;
  }

  /** Approves or discards drafts and keeps the per-run counters used to measure SM-1. */
  review(approve: readonly number[] = [], discard: readonly number[] = []): ReviewResult {
    const result: ReviewResult = { approved: 0, discarded: 0, skipped: 0 };
    const approveSet = new Set(approve);
    this.workspace.connection.sqlite.transaction(() => {
      for (const id of approveSet) {
        const row = this.db.select().from(item).where(eq(item.id, id)).get();
        if (!row || row.status !== "draft") {
          result.skipped += 1;
          continue;
        }
        this.db
          .update(item)
          .set({ status: "approved", approvedAt: isoNow(this.clock) })
          .where(eq(item.id, id))
          .run();
        this.db
          .update(generationRun)
          .set({
            approved: sql`${generationRun.approved} + 1`,
            approvedUnedited: sql`${generationRun.approvedUnedited} + ${row.edited ? 0 : 1}`,
          })
          .where(eq(generationRun.id, row.runId))
          .run();
        result.approved += 1;
      }
      for (const id of new Set(discard)) {
        const row = this.db.select().from(item).where(eq(item.id, id)).get();
        if (!row || row.status !== "draft" || approveSet.has(id)) {
          result.skipped += 1;
          continue;
        }
        this.db.update(item).set({ status: "discarded" }).where(eq(item.id, id)).run();
        this.db
          .update(generationRun)
          .set({ discardedReview: sql`${generationRun.discardedReview} + 1` })
          .where(eq(generationRun.id, row.runId))
          .run();
        result.discarded += 1;
      }
    })();
    return result;
  }

  approveAll(runId: number): ReviewResult {
    const ids = this.list({ runId, status: "draft", limit: 10_000 }).map((entry) => entry.id);
    return this.review(ids);
  }
}
