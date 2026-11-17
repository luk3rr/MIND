/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, eq, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { chunk, generationRun, item, material, topic } from "../db/workspace-schema.js";
import { cleanTopic, payloadProblem } from "../generation/cards.js";
import { pdfSourceOf } from "../reader/source.js";
import type { PdfSource } from "../reader/source.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export const FRONT_PROBLEMS = new Set(["empty_front", "empty_statement", "cloze_without_gap"]);
export const PROBLEM_MESSAGES: Record<string, string> = {
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
  /** Where the quote can be checked in the original PDF; null when it cannot. */
  pdfSource: PdfSource | null;
  edited: boolean;
  origin: string;
  createdAt: string;
  approvedAt: string | null;
  options: { key: string; text: string; why: string }[];
  answer: string | null;
}

/** One item of the catalog: enough to find, filter and manage it, with where it came from. */
export interface CatalogEntry {
  id: number;
  kind: string;
  subtype: string;
  front: string;
  back: string;
  status: string;
  topicId: number | null;
  topic: string | null;
  materialId: number | null;
  material: string | null;
  edited: boolean;
  createdAt: string;
  /** How the item came to be: generated, manual, reader, import or error_note. */
  origin: string;
  sourceTitle: string;
  sourcePage: number | null;
  /** True when "Ver no PDF" can open the cited page. */
  hasPdf: boolean;
}

export type BulkAction = "topic" | "discard" | "restore" | "approve";

export interface BulkResult {
  changed: number;
  skipped: number;
}

/** Longest text of the catalog entry: the list shows a line or two, the edit dialog the rest. */
const CATALOG_TEXT = 400;

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

  private info({ item: row, topic: topicName }: Row): ItemInfo {
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
      pdfSource: pdfSourceOf(this.db, row.chunkId, row.sourcePage, row.quote),
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
      .map((row) => this.info(row));
  }

  /** Every item of the workspace, light enough to filter and search on the screen. */
  catalog(): CatalogEntry[] {
    return this.db
      .select({
        item,
        topic: topic.name,
        materialId: generationRun.materialId,
        material: material.title,
      })
      .from(item)
      .innerJoin(generationRun, eq(generationRun.id, item.runId))
      .leftJoin(material, eq(material.id, generationRun.materialId))
      .leftJoin(topic, eq(topic.id, item.topicId))
      .orderBy(asc(item.id))
      .all()
      .map((row) => {
        const info = this.info({ item: row.item, topic: row.topic });
        return {
          id: info.id,
          kind: info.kind,
          subtype: info.subtype,
          front: info.front.slice(0, CATALOG_TEXT),
          back: info.back.slice(0, CATALOG_TEXT),
          status: info.status,
          topicId: row.item.topicId,
          topic: row.topic,
          materialId: row.materialId,
          material: row.material,
          edited: info.edited,
          createdAt: info.createdAt,
          origin: info.origin,
          sourceTitle: info.sourceTitle,
          sourcePage: info.sourcePage,
          hasPdf: info.pdfSource !== null,
        };
      });
  }

  /**
   * Applies one action to many items at once; the ones it does not fit (approving what is not a
   * draft, restoring what is not discarded) are skipped. `topicName` null removes the topic.
   */
  bulk(ids: readonly number[], action: BulkAction, topicName: string | null = null): BulkResult {
    const result: BulkResult = { changed: 0, skipped: 0 };
    const unique = [...new Set(ids)];
    this.workspace.connection.sqlite.transaction(() => {
      const topicId = action === "topic" ? this.topicId(cleanTopic(topicName)) : null;
      for (const id of unique) {
        const row = this.db.select().from(item).where(eq(item.id, id)).get();
        let done = false;
        if (row) {
          if (action === "topic") {
            this.db.update(item).set({ topicId }).where(eq(item.id, id)).run();
            done = true;
          } else if (action === "discard") {
            done =
              row.status === "draft"
                ? this.review([], [id]).discarded === 1
                : this.discardApproved(id);
          } else if (action === "restore") {
            done = this.restore(id) !== null;
          } else {
            done = this.review([id]).approved === 1;
          }
        }
        if (done) result.changed += 1;
        else result.skipped += 1;
      }
    })();
    return result;
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
    return this.info(row);
  }

  /** Text of the source chunk, or null when the chunk no longer exists. */
  sourceText(chunkId: number | null): string | null {
    if (chunkId === null) return null;
    return this.db.select().from(chunk).where(eq(chunk.id, chunkId)).get()?.text ?? null;
  }

  /**
   * Changes the text and topic of a draft or approved item; the source is kept. For a question,
   * `choices` may also rewrite the options (same letters, same count) and move the right answer.
   */
  edit(
    itemId: number,
    front: string,
    back: string,
    topicName: string | null,
    choices?: { options?: { key: string; text: string; why: string }[]; answer?: string },
  ): ItemInfo {
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
    const next: Record<string, unknown> = {
      ...old,
      [frontKey as string]: front.trim(),
      [backKey as string]: back.trim(),
    };
    if (isQuestion && choices) this.applyChoices(row.subtype, old, next, choices);
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

  /** Puts the edited options and answer of a question in `next`, or throws with the field at fault. */
  private applyChoices(
    subtype: string,
    old: Record<string, unknown>,
    next: Record<string, unknown>,
    choices: { options?: { key: string; text: string; why: string }[]; answer?: string },
  ): void {
    const fail = (field: string, message: string): never => {
      throw new AppError("VALIDATION_ERROR", message, [{ field, message }]);
    };
    const stored =
      (old["options"] as { key: string; text: string; why: string }[] | undefined) ?? [];
    // True/false statements always read Certo/Errado: only the verdict can change.
    const editable = subtype !== "certo_errado" && choices.options !== undefined;
    if (editable) {
      const given = choices.options ?? [];
      if (given.map((o) => o.key).join("") !== stored.map((o) => o.key).join("")) {
        fail("options", "As alternativas devem manter as mesmas letras.");
      }
      const seen = new Set<string>();
      for (const option of given) {
        if (!option.text.trim())
          fail(`option:${option.key}`, "O texto da alternativa não pode ficar vazio.");
        if (!option.why.trim())
          fail(`option:${option.key}`, "A justificativa não pode ficar vazia.");
        const text = option.text.trim().toLowerCase();
        if (seen.has(text)) fail(`option:${option.key}`, "Duas alternativas não podem ser iguais.");
        seen.add(text);
      }
      next["options"] = given.map((o) => ({ key: o.key, text: o.text.trim(), why: o.why.trim() }));
    }
    if (choices.answer !== undefined) {
      const keys = ((next["options"] as { key: string }[] | undefined) ?? stored).map((o) => o.key);
      if (!keys.includes(choices.answer))
        fail("answer", "Escolha uma das alternativas como correta.");
      next["answer"] = choices.answer;
    }
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

  /**
   * Takes an approved item out of study and practice (for one found wrong while studying). The
   * run counters are left alone: they measure the review of the drafts, and the history of
   * ratings and attempts is kept. Returns false when there was nothing to discard.
   */
  discardApproved(itemId: number): boolean {
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row) throw new AppError("ITEM_NOT_FOUND", `Não existe item com id ${itemId}.`);
    if (row.status !== "approved") return false;
    this.db.update(item).set({ status: "discarded" }).where(eq(item.id, itemId)).run();
    return true;
  }

  /**
   * Brings a discarded item back: as approved when it had been approved (it returns to study with
   * its history), otherwise as a draft to be reviewed. Returns the new status, or null when the
   * item was not discarded.
   */
  restore(itemId: number): "draft" | "approved" | null {
    const row = this.db.select().from(item).where(eq(item.id, itemId)).get();
    if (!row) throw new AppError("ITEM_NOT_FOUND", `Não existe item com id ${itemId}.`);
    if (row.status !== "discarded") return null;
    const status = row.approvedAt === null ? "draft" : "approved";
    this.workspace.connection.sqlite.transaction(() => {
      this.db.update(item).set({ status }).where(eq(item.id, itemId)).run();
      // A draft discarded in the review no longer counts as discarded there.
      if (status === "draft") {
        this.db
          .update(generationRun)
          .set({ discardedReview: sql`max(${generationRun.discardedReview} - 1, 0)` })
          .where(eq(generationRun.id, row.runId))
          .run();
      }
    })();
    return status;
  }

  approveAll(runId: number): ReviewResult {
    const ids = this.list({ runId, status: "draft", limit: 10_000 }).map((entry) => entry.id);
    return this.review(ids);
  }
}
