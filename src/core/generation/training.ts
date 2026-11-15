/*
 * Filename: training.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { attempt, chunk, item, material, reviewLog, topic } from "../db/workspace-schema.js";
import type { WorkspaceConnection } from "../db/databases.js";
import { Bm25Retriever } from "../retrieval/retriever.js";
import type { SourceChunk } from "./planning.js";

export const MAX_CHUNKS = 30;
export const MAX_AVOID = 25;
export const SEARCH_LIMIT = 20;

export interface TrainingMaterial {
  topicName: string;
  chunks: SourceChunk[];
  /** First lines of the items the topic already has, so the model does not repeat them. */
  avoid: string[];
}

/** Source chunks of the topic's items the user got wrong, most failures first. */
function failedChunkIds(connection: WorkspaceConnection, topicId: number): number[] {
  const { db } = connection;
  const cards = db
    .select({ chunkId: item.chunkId, total: count() })
    .from(item)
    .innerJoin(reviewLog, eq(reviewLog.itemId, item.id))
    .where(
      and(
        eq(item.topicId, topicId),
        eq(item.status, "approved"),
        eq(reviewLog.rating, 1),
        sql`${item.chunkId} is not null`,
      ),
    )
    .groupBy(item.chunkId)
    .all();
  const questions = db
    .select({ chunkId: item.chunkId, total: count() })
    .from(item)
    .innerJoin(attempt, eq(attempt.itemId, item.id))
    .where(
      and(
        eq(item.topicId, topicId),
        eq(item.status, "approved"),
        eq(attempt.correct, false),
        sql`${item.chunkId} is not null`,
      ),
    )
    .groupBy(item.chunkId)
    .all();
  const score = new Map<number, number>();
  for (const row of [...cards, ...questions]) {
    if (row.chunkId !== null) score.set(row.chunkId, (score.get(row.chunkId) ?? 0) + row.total);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
}

/** Source chunks of any item the topic has (discarded ones too), when nothing else points to text. */
function ownChunkIds(connection: WorkspaceConnection, topicId: number): number[] {
  return connection.db
    .selectDistinct({ chunkId: item.chunkId })
    .from(item)
    .where(
      and(
        eq(item.topicId, topicId),
        ne(item.status, "discarded"),
        sql`${item.chunkId} is not null`,
      ),
    )
    .orderBy(asc(item.chunkId))
    .all()
    .flatMap((row) => (row.chunkId === null ? [] : [row.chunkId]));
}

function existingTexts(connection: WorkspaceConnection, topicId: number): string[] {
  const rows = connection.db
    .select({ payload: item.payloadJson })
    .from(item)
    .where(and(eq(item.topicId, topicId), ne(item.status, "discarded")))
    .orderBy(desc(item.id))
    .limit(MAX_AVOID)
    .all();
  const texts: string[] = [];
  for (const row of rows) {
    const data = JSON.parse(row.payload) as { front?: string; statement?: string };
    const text = String(data.front ?? data.statement ?? "")
      .trim()
      .split("\n")[0] as string;
    if (text) texts.push(text.slice(0, 160));
  }
  return texts;
}

/** Failed source chunks first, then the best BM25 matches for the topic name, then its own items' chunks. */
export function trainingMaterial(
  connection: WorkspaceConnection,
  topicId: number,
): TrainingMaterial {
  const { db } = connection;
  const found = db.select().from(topic).where(eq(topic.id, topicId)).get();
  if (!found) throw new AppError("TOPIC_NOT_FOUND", `Não existe tópico com id ${topicId}.`);
  const ordered = failedChunkIds(connection, topicId);
  const avoid = existingTexts(connection, topicId);
  for (const hit of new Bm25Retriever(connection).search(found.name, { limit: SEARCH_LIMIT })) {
    if (!ordered.includes(hit.chunkId)) ordered.push(hit.chunkId);
  }
  // A topic given by hand rarely has its name in the text: its own items still say where to look.
  for (const id of ownChunkIds(connection, topicId)) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  const wanted = ordered.slice(0, MAX_CHUNKS);
  const rows = new Map(
    db
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
      .where(inArray(chunk.id, wanted.length ? wanted : [0]))
      .orderBy(asc(chunk.id))
      .all()
      .map((row) => [row.id, row] as const),
  );
  const chunks = wanted.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row satisfies SourceChunk] : [];
  });
  return { topicName: found.name, chunks, avoid };
}
