/*
 * Filename: planning.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, eq, gte, lte } from "drizzle-orm";
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
}

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
    })
    .from(chunk)
    .innerJoin(material, eq(material.id, chunk.materialId))
    .where(and(...filters))
    .orderBy(asc(chunk.ordinal))
    .all();
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
 * Groups chunks, picks batches and splits the requested quantity among them. By default the
 * batches are spread evenly over the chunks; with `spread = false` the first batches are used.
 */
export function planBatches(
  chunks: readonly SourceChunk[],
  quantity: number,
  perBatch = CARDS_PER_BATCH,
  spread = true,
): PlannedBatch[] {
  const batches = makeBatches(chunks);
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
