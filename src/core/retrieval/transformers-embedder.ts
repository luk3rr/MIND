/*
 * Filename: transformers-embedder.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { AppError } from "../contracts/errors.js";
import { JobCancelled } from "../jobs/queue.js";
import type { EmbedReply, EmbedRequest } from "./embed.worker.js";
import { embeddingsUnavailable } from "./embeddings.js";
import type { EmbedHooks, Embedder } from "./embeddings.js";

export const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const IDLE_MS = 60_000;

interface Pending {
  resolve(vectors: number[][]): void;
  reject(error: unknown): void;
  hooks: EmbedHooks;
}

/**
 * Embeds with transformers.js inside a worker thread, so the window never freezes. The worker is
 * created on first use, serves requests one at a time and is dropped after a minute of silence.
 * The model lives in `modelsDir`; it is downloaded only when `allowDownload` is set.
 */
export class TransformersEmbedder implements Embedder {
  readonly modelName = MODEL_ID;
  private worker: Worker | null = null;
  private idle: NodeJS.Timeout | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly modelsDir: string,
    private readonly createWorker: () => Worker,
  ) {}

  modelReady(): boolean {
    const folder = join(this.modelsDir, ...MODEL_ID.split("/"));
    return (
      existsSync(join(folder, "config.json")) &&
      existsSync(join(folder, "onnx", "model_quantized.onnx"))
    );
  }

  embed(texts: readonly string[], hooks: EmbedHooks = {}): Promise<number[][]> {
    if (!hooks.allowDownload && !this.modelReady()) {
      return Promise.reject(
        embeddingsUnavailable("O modelo de busca semântica não está instalado. Ative-o de novo."),
      );
    }
    // One request at a time keeps the worker's memory predictable.
    const run = this.chain.then(() => this.request(texts, hooks));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private request(texts: readonly string[], hooks: EmbedHooks): Promise<number[][]> {
    if (hooks.signal?.aborted) return Promise.reject(new JobCancelled());
    return new Promise<number[][]>((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = this.nextId++;
      const onAbort = (): void => {
        this.pending.delete(id);
        this.dropWorker();
        reject(new JobCancelled());
      };
      hooks.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        hooks,
        resolve: (vectors) => {
          hooks.signal?.removeEventListener("abort", onAbort);
          resolve(vectors);
        },
        reject: (error) => {
          hooks.signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      });
      if (this.idle) clearTimeout(this.idle);
      const request: EmbedRequest = {
        id,
        texts: [...texts],
        modelName: MODEL_ID,
        cacheDir: this.modelsDir,
        allowDownload: hooks.allowDownload ?? false,
      };
      worker.postMessage(request);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.on("message", (reply: EmbedReply) => this.onReply(reply));
    worker.on("error", (error) => this.fail(error));
    worker.on("exit", (code) => {
      if (this.worker === worker) this.fail(new Error(`Embedding worker stopped (code ${code}).`));
    });
    this.worker = worker;
    return worker;
  }

  private onReply(reply: EmbedReply): void {
    const entry = this.pending.get(reply.id);
    if (!entry) return;
    if (reply.type === "progress") {
      entry.hooks.onProgress?.(reply.progress, reply.message);
      return;
    }
    this.pending.delete(reply.id);
    if (reply.type === "result") entry.resolve(reply.vectors);
    else {
      entry.reject(reply.code ? new AppError(reply.code, reply.message) : new Error(reply.message));
    }
    if (this.pending.size === 0) this.scheduleIdle();
  }

  private fail(error: unknown): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    this.dropWorker();
    for (const entry of waiting) entry.reject(error);
  }

  private scheduleIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.dropWorker(), IDLE_MS);
    this.idle.unref();
  }

  private dropWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    if (worker) void worker.terminate();
  }

  /** Stops the worker; the next request starts a new one. */
  close(): void {
    this.fail(new Error("Embedder closed."));
  }
}
