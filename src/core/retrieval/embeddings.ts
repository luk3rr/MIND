/*
 * Filename: embeddings.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { logger } from "../logging.js";

const log = logger("embeddings");
import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import type { WorkspaceConnection } from "../db/databases.js";
import { chunk, chunkEmbedding, material, meta } from "../db/workspace-schema.js";
import type { JobContext, JobQueue } from "../jobs/queue.js";
import { listJobs } from "../jobs/store.js";
import type { RetrievedChunk, Retriever, SearchOptions } from "./retriever.js";

export const META_KEY = "embeddings";
export const BATCH = 32;
export const RRF_K = 60;
export const CANDIDATES = 40;

export interface EmbedHooks {
  signal?: AbortSignal;
  /** Reports 0 to 1 and a short message while the model downloads or loads. */
  onProgress?: (progress: number, message: string) => void;
  /** Only the "enable" flow may download the model; later calls fail when it is missing. */
  allowDownload?: boolean;
}

export interface Embedder {
  readonly modelName: string;
  /** Whether the model files are already on disk (no download needed). */
  modelReady(): boolean;
  embed(texts: readonly string[], hooks?: EmbedHooks): Promise<number[][]>;
}

export function embeddingsUnavailable(message: string): AppError {
  return new AppError("EMBEDDINGS_UNAVAILABLE", message);
}

export function normalizeVector(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return norm ? vector.map((x) => x / norm) : [...vector];
}

/** Float32 little-endian bytes of the normalized vector. */
export function pack(vector: readonly number[]): Buffer {
  const values = Float32Array.from(normalizeVector(vector));
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

export function unpack(blob: Uint8Array): Float32Array {
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += (a[i] as number) * (b[i] as number);
  return total;
}

export interface EmbeddingStatus {
  /** The model is on disk, or a custom embedder is configured. */
  modelReady: boolean;
  enabled: boolean;
  indexed: number;
  total: number;
  model: string;
}

export interface EmbeddingJob {
  state: string;
  progress: number;
  message: string;
  errorDetail: string | null;
}

/** Vectorizes chunks and keeps the per-workspace on/off switch. */
export class EmbeddingStore {
  constructor(
    private readonly connection: WorkspaceConnection,
    private readonly embedder: Embedder,
  ) {}

  private get db() {
    return this.connection.db;
  }

  enabled(): boolean {
    return this.db.select().from(meta).where(eq(meta.key, META_KEY)).get()?.value === "on";
  }

  setEnabled(value: boolean): void {
    const row = { key: META_KEY, value: value ? "on" : "off" };
    this.db
      .insert(meta)
      .values(row)
      .onConflictDoUpdate({ target: meta.key, set: { value: row.value } })
      .run();
  }

  status(): EmbeddingStatus {
    const indexed =
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(chunkEmbedding)
        .where(eq(chunkEmbedding.model, this.embedder.modelName))
        .get()?.total ?? 0;
    const total =
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(chunk)
        .get()?.total ?? 0;
    return {
      modelReady: this.embedder.modelReady(),
      enabled: this.enabled(),
      indexed,
      total,
      model: this.embedder.modelName,
    };
  }

  pending(): { id: number; text: string }[] {
    const done = this.db
      .select({ id: chunkEmbedding.chunkId })
      .from(chunkEmbedding)
      .where(eq(chunkEmbedding.model, this.embedder.modelName))
      .all()
      .map((row) => row.id);
    return this.db
      .select({ id: chunk.id, text: chunk.text })
      .from(chunk)
      .where(done.length ? notInArray(chunk.id, done) : undefined)
      .orderBy(chunk.id)
      .all();
  }

  /** Embeds every chunk that has no vector for the current model. Returns how many. */
  async indexPending(hooks: EmbedHooks = {}): Promise<number> {
    const pending = this.pending();
    const { onProgress, ...embedHooks } = hooks;
    for (let start = 0; start < pending.length; start += BATCH) {
      if (hooks.signal?.aborted) break;
      const batch = pending.slice(start, start + BATCH);
      const vectors = await this.embedder.embed(
        batch.map((row) => row.text),
        { ...embedHooks, ...(onProgress ? { onProgress } : {}) },
      );
      this.db.transaction((tx) => {
        batch.forEach((row, index) => {
          const vector = vectors[index] as number[];
          const values = {
            chunkId: row.id,
            model: this.embedder.modelName,
            dim: vector.length,
            vector: pack(vector),
          };
          tx.insert(chunkEmbedding)
            .values(values)
            .onConflictDoUpdate({ target: chunkEmbedding.chunkId, set: values })
            .run();
        });
      });
      onProgress?.(Math.min(1, (start + batch.length) / pending.length), "vetorizando trechos");
    }
    if (pending.length > 0) log.info("chunks vectorized", { count: pending.length });
    return pending.length;
  }
}

/** Cosine similarity (a dot product of normalized vectors) over the stored vectors. */
export class EmbeddingRetriever implements Retriever {
  constructor(
    private readonly connection: WorkspaceConnection,
    private readonly embedder: Embedder,
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<RetrievedChunk[]> {
    const limit = options.limit ?? 20;
    if (!query.trim() || limit < 1) return [];
    const [first] = await this.embedder.embed([query]);
    const wanted = normalizeVector(first as number[]);
    const filters = [eq(chunkEmbedding.model, this.embedder.modelName)];
    if (options.materialIds) filters.push(inArray(chunk.materialId, [...options.materialIds]));
    if (options.pageFrom !== undefined) filters.push(gte(chunk.page, options.pageFrom));
    if (options.pageTo !== undefined) filters.push(lte(chunk.page, options.pageTo));
    const { db } = this.connection;
    const rows = db
      .select({ id: chunkEmbedding.chunkId, vector: chunkEmbedding.vector })
      .from(chunkEmbedding)
      .innerJoin(chunk, eq(chunk.id, chunkEmbedding.chunkId))
      .where(and(...filters))
      .all();
    const top = rows
      .map((row) => ({ id: row.id, score: dot(wanted, unpack(row.vector)) }))
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, limit);
    const found: RetrievedChunk[] = [];
    for (const { id, score } of top) {
      const row = db
        .select({
          chunkId: chunk.id,
          materialId: chunk.materialId,
          materialTitle: material.title,
          page: chunk.page,
          section: chunk.section,
          text: chunk.text,
        })
        .from(chunk)
        .innerJoin(material, eq(material.id, chunk.materialId))
        .where(eq(chunk.id, id))
        .get();
      if (row) found.push({ ...row, score });
    }
    return found;
  }
}

/** Fuses the BM25 and the semantic rankings with Reciprocal Rank Fusion. */
export class HybridRetriever implements Retriever {
  constructor(
    private readonly lexical: Retriever,
    private readonly semantic: Retriever,
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<RetrievedChunk[]> {
    const limit = options.limit ?? 20;
    const wide = { ...options, limit: Math.max(limit, CANDIDATES) };
    const lexical = await this.lexical.search(query, wide);
    let semantic: RetrievedChunk[];
    try {
      semantic = await this.semantic.search(query, wide);
    } catch (error) {
      // The model was removed or cannot load after the option was turned on: BM25 still works.
      if (error instanceof AppError && error.code === "EMBEDDINGS_UNAVAILABLE") {
        return lexical.slice(0, limit);
      }
      throw error;
    }
    const fused = new Map<number, number>();
    const byId = new Map<number, RetrievedChunk>();
    for (const ranking of [lexical, semantic]) {
      ranking.forEach((found, index) => {
        fused.set(found.chunkId, (fused.get(found.chunkId) ?? 0) + 1 / (RRF_K + index + 1));
        if (!byId.has(found.chunkId)) byId.set(found.chunkId, found);
      });
    }
    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, limit)
      .map(([id, score]) => ({ ...(byId.get(id) as RetrievedChunk), score }));
  }
}

/** Per-workspace control of the optional embeddings: status, enable, disable. */
export class EmbeddingsService {
  readonly store: EmbeddingStore;

  constructor(
    private readonly workspaceId: number,
    private readonly connection: WorkspaceConnection,
    private readonly queue: JobQueue,
    private readonly embedder: Embedder,
  ) {
    this.store = new EmbeddingStore(connection, embedder);
  }

  /** The status plus the latest vectorizing job, so the screen can show progress or failure. */
  status(): EmbeddingStatus & { job: EmbeddingJob | null } {
    const latest = listJobs(this.connection.db, 20).find((job) => job.type === "embeddings");
    return {
      ...this.store.status(),
      job: latest
        ? {
            state: latest.state,
            progress: latest.progress,
            message: latest.message,
            errorDetail: latest.errorDetail,
          }
        : null,
    };
  }

  /**
   * Turns the option on and queues the job that downloads the model (once) and vectorizes the
   * chunks that still have no vector. Returns the job id, or null when nothing was pending and
   * the model is already on disk.
   */
  enable(): number | null {
    this.store.setEnabled(true);
    log.info("semantic search enabled", { workspace: this.workspaceId });
    const status = this.store.status();
    if (status.modelReady && status.indexed >= status.total) return null;
    const job = this.queue.submit(
      this.workspaceId,
      this.connection.db,
      "embeddings",
      async (context: JobContext) => {
        const hooks: EmbedHooks = {
          allowDownload: true,
          signal: context.signal,
          onProgress: (progress, message) => {
            context.update(progress, message);
            context.checkCancelled();
          },
        };
        const indexed = await this.store.indexPending(hooks);
        // With nothing to vectorize the model must still be ready for the first question.
        if (indexed === 0 && !this.embedder.modelReady()) await this.embedder.embed(["."], hooks);
      },
    );
    return job.id;
  }

  disable(): void {
    this.store.setEnabled(false);
    log.info("semantic search disabled", { workspace: this.workspaceId });
  }

  /** The retriever the chat should use: hybrid when the option is on, BM25 otherwise. */
  retriever(lexical: Retriever): Retriever {
    return this.store.enabled()
      ? new HybridRetriever(lexical, new EmbeddingRetriever(this.connection, this.embedder))
      : lexical;
  }
}
