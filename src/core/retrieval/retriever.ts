/*
 * Filename: retriever.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { WorkspaceConnection } from "../db/databases.js";

const TOKEN = /[\p{L}\p{N}_]+/gu;
const MAX_TERMS = 32;

export interface RetrievedChunk {
  chunkId: number;
  materialId: number;
  materialTitle: string;
  page: number | null;
  section: string | null;
  text: string;
  score: number;
}

export interface SearchOptions {
  materialIds?: readonly number[];
  pageFrom?: number;
  pageTo?: number;
  limit?: number;
}

/** Turns free text into a safe FTS5 query: quoted terms joined by OR. */
export function buildMatchQuery(query: string): string | null {
  const terms = (query.match(TOKEN) ?? []).slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"`).join(" OR ");
}

/** Anything that finds chunks for a query: BM25 now, semantic and hybrid when enabled. */
export interface Retriever {
  search(query: string, options?: SearchOptions): RetrievedChunk[] | Promise<RetrievedChunk[]>;
}

/** BM25 search over the `chunk_fts` index. */
export class Bm25Retriever {
  constructor(private readonly connection: WorkspaceConnection) {}

  search(query: string, options: SearchOptions = {}): RetrievedChunk[] {
    const limit = options.limit ?? 20;
    const match = buildMatchQuery(query);
    if (match === null || limit < 1) return [];
    const clauses = ["chunk_fts MATCH ?"];
    const params: (string | number)[] = [match];
    if (options.materialIds) {
      if (options.materialIds.length === 0) return [];
      clauses.push(`c.material_id IN (${options.materialIds.map(() => "?").join(",")})`);
      params.push(...options.materialIds);
    }
    if (options.pageFrom !== undefined) {
      clauses.push("c.page >= ?");
      params.push(options.pageFrom);
    }
    if (options.pageTo !== undefined) {
      clauses.push("c.page <= ?");
      params.push(options.pageTo);
    }
    params.push(limit);
    // The clauses are fixed literals; every value travels as a bound parameter.
    const sql =
      "SELECT c.id, c.material_id, m.title, c.page, c.section, c.text, bm25(chunk_fts) AS rank " +
      "FROM chunk_fts JOIN chunk c ON c.id = chunk_fts.rowid " +
      "JOIN material m ON m.id = c.material_id " +
      `WHERE ${clauses.join(" AND ")} ORDER BY rank LIMIT ?`;
    const rows = this.connection.sqlite.prepare(sql).all(...params) as {
      id: number;
      material_id: number;
      title: string;
      page: number | null;
      section: string | null;
      text: string;
      rank: number;
    }[];
    return rows.map((row) => ({
      chunkId: row.id,
      materialId: row.material_id,
      materialTitle: row.title,
      page: row.page,
      section: row.section,
      text: row.text,
      score: -row.rank,
    }));
  }
}
