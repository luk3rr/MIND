/*
 * Filename: backend.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Worker } from "node:worker_threads";
import { AppError } from "../contracts/errors.js";
import type { ErrorCode } from "../contracts/errors.js";
import { PdfReader } from "./pdf-reader.js";

/** The reading operations; each one takes the absolute path of the PDF first. */
export type ReaderMethods = Pick<
  PdfReader,
  "info" | "renderPage" | "renderRegion" | "text" | "search" | "locate"
>;
export type ReaderMethod = keyof ReaderMethods;
export type ReaderResult<M extends ReaderMethod> = ReturnType<ReaderMethods[M]>;

export interface ReaderBackend {
  call<M extends ReaderMethod>(
    method: M,
    args: Parameters<ReaderMethods[M]>,
  ): Promise<ReaderResult<M>>;
  close(): Promise<void>;
}

/** Runs the reader in the calling thread (tests, and a fallback when no worker is given). */
export class InProcessReader implements ReaderBackend {
  private readonly reader = new PdfReader();

  call<M extends ReaderMethod>(
    method: M,
    args: Parameters<ReaderMethods[M]>,
  ): Promise<ReaderResult<M>> {
    try {
      const run = this.reader[method] as (...input: unknown[]) => ReaderResult<M>;
      return Promise.resolve(run.apply(this.reader, args));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  close(): Promise<void> {
    this.reader.close();
    return Promise.resolve();
  }
}

export interface ReaderRequest {
  id: number;
  method: ReaderMethod;
  args: unknown[];
}

export type ReaderReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; code?: ErrorCode; message: string };

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/** Keeps one worker thread alive and sends it requests, so drawing a page never blocks the app. */
export class WorkerReader implements ReaderBackend {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly createWorker: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.on("message", (reply: ReaderReply) => {
      const waiting = this.pending.get(reply.id);
      if (!waiting) return;
      this.pending.delete(reply.id);
      if (reply.ok) waiting.resolve(reply.value);
      else {
        waiting.reject(
          reply.code ? new AppError(reply.code, reply.message) : new Error(reply.message),
        );
      }
    });
    const fail = (error: Error): void => {
      if (this.worker === worker) this.worker = null;
      for (const waiting of this.pending.values()) waiting.reject(error);
      this.pending.clear();
    };
    worker.on("error", (error) => fail(error));
    worker.on("exit", (code) => fail(new Error(`The PDF reader stopped (exit code ${code}).`)));
    this.worker = worker;
    return worker;
  }

  call<M extends ReaderMethod>(
    method: M,
    args: Parameters<ReaderMethods[M]>,
  ): Promise<ReaderResult<M>> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      const request: ReaderRequest = { id, method, args };
      this.ensure().postMessage(request);
    });
  }

  async close(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    for (const waiting of this.pending.values())
      waiting.reject(new Error("The reader was closed."));
    this.pending.clear();
    await worker?.terminate();
  }
}
