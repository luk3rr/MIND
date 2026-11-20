/*
 * Filename: planning.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Role } from "../analysis/classifier.js";
import { chunk, material } from "../db/workspace-schema.js";
import type { WorkspaceDb } from "../jobs/store.js";

export const BATCH_CHARS = 6000;
export const CARDS_PER_BATCH = 5;
export const QUESTIONS_PER_BATCH = 3;

export interface SourceChunk {
  id: number;
  materialId: number;
  materialTitle: string;
  page: number | null;
  section: string | null;
  text: string;
  /** What the chunk is, once the material has been analyzed; absent or null before. */
  role?: Role | null;
  /** The unit of the chunk in its material, once analyzed. */
  unit?: number | null;
  /** The chunk is sent only to be understood next to the others, and is never a source. */
  context?: boolean;
}

/** The first chunk of a batch that can be a source: what tells one batch from another. */
export const batchKey = (batch: readonly SourceChunk[]): number | undefined =>
  (batch.find((c) => c.context !== true) ?? batch[0])?.id;

export interface PlannedBatch {
  chunks: SourceChunk[];
  count: number;
}

export function chunkLabel(item: SourceChunk): string {
  const parts = [item.materialTitle];
  if (item.page !== null) parts.push(`p.${item.page}`);
  if (item.section) parts.push(item.section);
  return parts.join(" ");
}

export function selectChunks(
  db: WorkspaceDb,
  materialId: number,
  pageFrom?: number,
  pageTo?: number,
): SourceChunk[] {
  const filters = [eq(chunk.materialId, materialId)];
  if (pageFrom !== undefined) filters.push(gte(chunk.page, pageFrom));
  if (pageTo !== undefined) filters.push(lte(chunk.page, pageTo));
  return db
    .select({
      id: chunk.id,
      materialId: chunk.materialId,
      materialTitle: material.title,
      page: chunk.page,
      section: chunk.section,
      text: chunk.text,
      role: chunk.role,
      unit: chunk.unit,
    })
    .from(chunk)
    .innerJoin(material, eq(material.id, chunk.materialId))
    .where(and(...filters))
    .orderBy(asc(chunk.ordinal))
    .all()
    .map((row) => ({ ...row, role: row.role as Role | null }));
}

export function makeBatches(
  chunks: readonly SourceChunk[],
  maxChars = BATCH_CHARS,
): SourceChunk[][] {
  const batches: SourceChunk[][] = [];
  let current: SourceChunk[] = [];
  let size = 0;
  for (const item of chunks) {
    if (current.length > 0 && size + item.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function splitQuantity(quantity: number, parts: number): number[] {
  const base = Math.floor(quantity / parts);
  const extra = quantity % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}

/** Python's `round`: halves go to the nearest even integer. */
export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Picks `wanted` indices evenly spread over `0..total-1`. */
export function spreadIndices(total: number, wanted: number): number[] {
  if (wanted >= total) return Array.from({ length: total }, (_, index) => index);
  if (wanted === 1) return [Math.floor(total / 2)];
  return Array.from({ length: wanted }, (_, i) => pyRound((i * (total - 1)) / (wanted - 1)));
}

/**
 * The batches for a second round: the content the first round did not use, with the missing
 * quantity split among them. Empty when the first round already went through every batch.
 */
export function planMore(
  chunks: readonly SourceChunk[],
  planned: readonly PlannedBatch[],
  missing: number,
  perBatch = CARDS_PER_BATCH,
  spread = true,
): PlannedBatch[] {
  return planMoreFrom(makeBatches(chunks), planned, missing, perBatch, spread);
}

/** `planMore` over batches that were already made (by size or by unit). */
export function planMoreFrom(
  batches: readonly SourceChunk[][],
  planned: readonly PlannedBatch[],
  missing: number,
  perBatch = CARDS_PER_BATCH,
  spread = true,
): PlannedBatch[] {
  const used = new Set(planned.map((batch) => batchKey(batch.chunks)));
  const unused = batches.filter((batch) => !used.has(batchKey(batch)));
  if (unused.length === 0 || missing < 1) return [];
  const wanted = Math.min(Math.ceil(missing / perBatch), unused.length);
  const indices = spread
    ? spreadIndices(unused.length, wanted)
    : Array.from({ length: wanted }, (_, index) => index);
  const counts = splitQuantity(missing, wanted);
  return indices.map((index, position) => ({
    chunks: unused[index] as SourceChunk[],
    count: counts[position] as number,
  }));
}

/**
 * Groups chunks, picks batches and splits the requested quantity among them. By default the
 * batches are spread evenly over the chunks; with `spread = false` the first batches are used.
 */
export function planBatches(
  chunks: readonly SourceChunk[],
  quantity: number,
  perBatch = CARDS_PER_BATCH,
  spread = true,
): PlannedBatch[] {
  return planFrom(makeBatches(chunks), quantity, perBatch, spread);
}

/** Picks batches among the ones already made and splits the quantity among them. */
export function planFrom(
  batches: readonly SourceChunk[][],
  quantity: number,
  perBatch = CARDS_PER_BATCH,
  spread = true,
): PlannedBatch[] {
  if (batches.length === 0 || quantity < 1) return [];
  const wanted = Math.min(Math.ceil(quantity / perBatch), batches.length);
  const indices = spread
    ? spreadIndices(batches.length, wanted)
    : Array.from({ length: wanted }, (_, index) => index);
  const counts = splitQuantity(quantity, wanted);
  return indices.map((index, position) => ({
    chunks: batches[index] as SourceChunk[],
    count: counts[position] as number,
  }));
}

/** The roles an item may be made from, by kind (see `design.md § 2.6`). */
export const SOURCE_ROLES: Record<"card" | "question", readonly Role[]> = {
  // An exam question is not a card, and neither is a motivating text or a page of the material;
  // the teacher's comment that explains the rule can be.
  card: ["concept", "example", "commentary"],
  // A question may be inspired by an exam question (with new data), never by the rest.
  question: ["concept", "example", "commentary", "exam_question"],
};

/** How much a batch of whole units may hold: more than a batch by size, so a unit is never cut. */
export const UNIT_BATCH_MAX_CHARS = 9000;

const charsOf = (chunks: readonly SourceChunk[]): number =>
  chunks.reduce((total, c) => total + c.text.length, 0);

/**
 * Batches made of whole units of an analyzed material, for one kind of item. A chunk whose role
 * may not be a source is left out, except as context for the others of its unit (a motivating
 * text next to the question it opens); the pages of the material that are not content are never
 * sent. A chunk without a role is taken as content (the reviewers decide). A unit that alone is
 * bigger than `UNIT_BATCH_MAX_CHARS` is split at a chunk boundary.
 */
export function unitBatches(
  chunks: readonly SourceChunk[],
  kind: "card" | "question",
  maxChars = BATCH_CHARS,
): SourceChunk[][] {
  const allowed = new Set<Role>(SOURCE_ROLES[kind]);
  const isSource = (c: SourceChunk): boolean => c.role == null || allowed.has(c.role);
  const units: SourceChunk[][] = [];
  for (const c of chunks) {
    const last = units.at(-1);
    if (last && c.unit != null && last[0]?.unit === c.unit) last.push(c);
    else units.push([c]);
  }
  // Each unit becomes one or more pieces: its sources, with the context of the unit attached.
  const pieces: SourceChunk[][] = [];
  for (const unit of units) {
    const sources = unit.filter(isSource);
    if (sources.length === 0) continue;
    const context = unit
      .filter((c) => !isSource(c) && c.role !== "other")
      .map((c) => ({ ...c, context: true }));
    const inOrder = (list: SourceChunk[]): SourceChunk[] => [...list].sort((a, b) => a.id - b.id);
    if (charsOf(sources) + charsOf(context) <= UNIT_BATCH_MAX_CHARS) {
      pieces.push(inOrder([...sources, ...context]));
      continue;
    }
    let part: SourceChunk[] = [];
    for (const source of sources) {
      if (part.length > 0 && charsOf(part) + source.text.length > UNIT_BATCH_MAX_CHARS) {
        pieces.push(inOrder(part));
        part = [];
      }
      part.push(source);
    }
    if (part.length > 0) pieces.push(inOrder(part));
  }
  const batches: SourceChunk[][] = [];
  let current: SourceChunk[] = [];
  for (const piece of pieces) {
    if (current.length > 0 && charsOf(current) + charsOf(piece) > maxChars) {
      batches.push(current);
      current = [];
    }
    current.push(...piece);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
