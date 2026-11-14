/*
 * Filename: worker-pool.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Worker } from "node:worker_threads";
import { AppError } from "../contracts/errors.js";
import type { ErrorCode } from "../contracts/errors.js";
import { JobCancelled } from "./queue.js";

/** Messages a worker sends back to the main process. */
export type WorkerMessage =
  | { type: "progress"; progress: number; message?: string }
  | { type: "result"; value: unknown }
  | { type: "error"; code?: ErrorCode; message: string };

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}

/**
 * Runs one task in its own worker thread so CPU-heavy work (PDF, OCR, embeddings) never blocks
 * the main process. The worker receives `{ payload }` and answers with `WorkerMessage`s.
 * Aborting the signal terminates the worker and rejects with `JobCancelled`.
 */
export function runInWorker<T>(
  createWorker: () => Worker,
  payload: unknown,
  options: RunOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new JobCancelled());
      return;
    }
    const worker = createWorker();
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      void worker.terminate();
      action();
    };
    const onAbort = (): void => finish(() => reject(new JobCancelled()));
    options.signal?.addEventListener("abort", onAbort, { once: true });

    worker.on("message", (message: WorkerMessage) => {
      if (message.type === "progress") {
        options.onProgress?.(message.progress, message.message ?? "");
      } else if (message.type === "result") {
        finish(() => resolve(message.value as T));
      } else {
        finish(() =>
          reject(
            message.code ? new AppError(message.code, message.message) : new Error(message.message),
          ),
        );
      }
    });
    worker.on("error", (error) => finish(() => reject(error)));
    worker.on("exit", (code) =>
      finish(() => reject(new Error(`Worker stopped before answering (exit code ${code}).`))),
    );
    worker.postMessage({ payload });
  });
}
