/*
 * Filename: service.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { chunk, generationRun, item, material, topic } from "../db/workspace-schema.js";
import { cleanTopic } from "../generation/cards.js";
import { locateQuote, MIN_QUOTE_CHARS, normalize } from "../verification/source-checker.js";
import { draftProblem, payloadOf } from "./validate.js";
import type { ItemDraft } from "./validate.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

export type { CardDraft, ItemDraft, QuestionDraft } from "./validate.js";

/** Where an item that was not made by a model generation comes from. */
export type AuthoredOrigin = "manual" | "reader" | "import";

/** The part of a material an item points to. `page` is null for materials without pages. */
export interface SourceInput {
  materialId: number;
  page: number | null;
  quote: string;
}

export interface ResolvedSource {
  match: "full" | "partial" | "none";
  chunkId: number | null;
  /** What the item keeps as its quote: the part that was found, or the text as given. */
  quote: string;
  materialTitle: string;
}

export interface CreateInput {
  draft: ItemDraft;
  /** Optional: items written by hand need not point to a material. */
  source?: SourceInput;
  /** Topic label; created when new. */
  topic: string | null;
  origin: AuthoredOrigin;
}

export interface Created {
  itemId: number;
  topicCreated: boolean;
  /** True when the item points to a chunk of a material (so "Ver no PDF" can work). */
  sourceLinked: boolean;
}

/**
 * Creates items that do not come from a generation: written by hand, taken from the reader or
 * imported. They are born approved (the person wrote or checked them) and, like the cards made
 * from the error notebook, hang on one synthetic run per origin.
 */
export class ItemAuthoringService {
  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly clock: Clock = systemClock,
  ) {}

  private get db() {
    return this.workspace.connection.db;
  }

  /**
   * The synthetic run of an origin and material, created the first time it is needed. The
   * material of an item is the one of its run, so an item with a source must hang on a run that
   * names it; items with no material share one run of their origin.
   */
  ensureRun(origin: AuthoredOrigin, materialId: number | null = null): number {
    const found = this.db
      .select({ id: generationRun.id })
      .from(generationRun)
      .where(
        and(
          eq(generationRun.kind, origin),
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
        kind: origin,
        subtype: origin,
        materialId,
        model: "-",
        requested: 0,
        status: "done",
        finishedAt: this.clock.now().toISOString(),
      })
      .returning({ id: generationRun.id })
      .get().id;
  }

  create(input: CreateInput): Created {
    const { draft } = input;
    const problem = draftProblem(draft);
    if (problem !== null) throw new AppError("VALIDATION_ERROR", problem.message, [problem]);
    const payload = payloadOf(draft);
    const source = input.source
      ? this.resolveSource({
          materialId: input.source.materialId,
          page: input.source.page,
          text: input.source.quote,
        })
      : null;
    const now = this.clock.now().toISOString();
    let result: Created | undefined;
    this.workspace.connection.sqlite.transaction(() => {
      const [topicId, topicCreated] = this.topicFor(cleanTopic(input.topic));
      const row = this.db
        .insert(item)
        .values({
          runId: this.ensureRun(input.origin, input.source?.materialId ?? null),
          kind: draft.kind,
          subtype: draft.subtype,
          payloadJson: JSON.stringify(payload),
          status: "approved",
          topicId,
          chunkId: source?.chunkId ?? null,
          sourceTitle: source?.materialTitle ?? "",
          sourcePage: input.source?.page ?? null,
          quote: source?.quote ?? "",
          origin: input.origin,
          createdAt: now,
          approvedAt: now,
        })
        .returning({ id: item.id })
        .get();
      result = { itemId: row.id, topicCreated, sourceLinked: source?.chunkId != null };
    })();
    return result as Created;
  }

  /**
   * Places a text taken from a material in one of its chunks of the page, ignoring spacing and
   * case. When the whole text is not in a single chunk it keeps the longest beginning that is, so
   * the quote stays checkable; when nothing matches the item keeps the text but has no chunk.
   */
  resolveSource(input: { materialId: number; page: number | null; text: string }): ResolvedSource {
    const found = this.db
      .select({ title: material.title })
      .from(material)
      .where(eq(material.id, input.materialId))
      .get();
    if (!found) {
      throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${input.materialId}.`);
    }
    const text = input.text.trim();
    const chunks = this.db
      .select({ id: chunk.id, text: chunk.text })
      .from(chunk)
      .where(
        and(
          eq(chunk.materialId, input.materialId),
          input.page === null ? isNull(chunk.page) : eq(chunk.page, input.page),
        ),
      )
      .orderBy(asc(chunk.ordinal))
      .all();
    const find = (candidate: string) =>
      chunks.find((row) => locateQuote(row.text, candidate) !== null);
    const whole = find(text);
    if (whole) return { match: "full", chunkId: whole.id, quote: text, materialTitle: found.title };
    // A beginning that is found stays found when it is shortened, so the longest one is searched.
    let low = 1;
    let high = text.length - 1;
    let best: { length: number; chunkId: number } | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const hit = find(text.slice(0, middle));
      if (hit) {
        best = { length: middle, chunkId: hit.id };
        low = middle + 1;
      } else high = middle - 1;
    }
    if (best && normalize(text.slice(0, best.length)).text.length >= MIN_QUOTE_CHARS) {
      return {
        match: "partial",
        chunkId: best.chunkId,
        quote: text.slice(0, best.length).trim(),
        materialTitle: found.title,
      };
    }
    return { match: "none", chunkId: null, quote: text, materialTitle: found.title };
  }

  /**
   * Creates many items at once, all or none: used when a spreadsheet is imported. The items are
   * approved and share the synthetic run of their origin; topics are created as they are needed.
   * Every draft must already have passed `draftProblem`.
   */
  createMany(
    inputs: readonly { draft: ItemDraft; topic: string | null }[],
    origin: AuthoredOrigin,
  ): { itemIds: number[]; topicsCreated: number } {
    const now = this.clock.now().toISOString();
    const itemIds: number[] = [];
    let topicsCreated = 0;
    this.workspace.connection.sqlite.transaction(() => {
      const runId = this.ensureRun(origin);
      const topics = new Map<string, number>(
        this.db
          .select({ id: topic.id, name: topic.name })
          .from(topic)
          .all()
          .map((row) => [row.name.toLowerCase(), row.id]),
      );
      for (const input of inputs) {
        const problem = draftProblem(input.draft);
        if (problem !== null) throw new AppError("VALIDATION_ERROR", problem.message, [problem]);
        const name = cleanTopic(input.topic);
        let topicId: number | null = null;
        if (name !== null) {
          topicId = topics.get(name.toLowerCase()) ?? null;
          if (topicId === null) {
            topicId = this.db.insert(topic).values({ name }).returning({ id: topic.id }).get().id;
            topics.set(name.toLowerCase(), topicId);
            topicsCreated += 1;
          }
        }
        itemIds.push(
          this.db
            .insert(item)
            .values({
              runId,
              kind: input.draft.kind,
              subtype: input.draft.subtype,
              payloadJson: JSON.stringify(payloadOf(input.draft)),
              status: "approved",
              topicId,
              origin,
              createdAt: now,
              approvedAt: now,
            })
            .returning({ id: item.id })
            .get().id,
        );
      }
    })();
    return { itemIds, topicsCreated };
  }

  /** The id of the topic called `name` (case-insensitive), and whether it was just created. */
  private topicFor(name: string | null): [number | null, boolean] {
    if (name === null) return [null, false];
    const found = this.db
      .select({ id: topic.id })
      .from(topic)
      .where(sql`lower(${topic.name}) = ${name.toLowerCase()}`)
      .get();
    if (found) return [found.id, false];
    return [this.db.insert(topic).values({ name }).returning({ id: topic.id }).get().id, true];
  }
}
