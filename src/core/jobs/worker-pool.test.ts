/*
 * Filename: worker-pool.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { monitorEventLoopDelay } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { JobCancelled } from "./queue.js";
import { runInWorker } from "./worker-pool.js";

/** Builds a worker from inline CommonJS code that answers one `{ payload }` message. */
function inline(code: string): () => Worker {
  const source = `const { parentPort } = require("node:worker_threads");
parentPort.once("message", ({ payload }) => { ${code} });`;
  return () => new Worker(source, { eval: true });
}

describe("runInWorker", () => {
  it("returns the worker result and relays progress", async () => {
    const seen: [number, string][] = [];
    const result = await runInWorker<number>(
      inline(`parentPort.postMessage({ type: "progress", progress: 0.5, message: "half" });
        parentPort.postMessage({ type: "result", value: payload.a + payload.b });`),
      { a: 2, b: 3 },
      { onProgress: (progress, message) => seen.push([progress, message]) },
    );
    expect(result).toBe(5);
    expect(seen).toEqual([[0.5, "half"]]);
  });

  it("rejects with an AppError when the worker reports a coded error", async () => {
    const run = runInWorker(
      inline(
        `parentPort.postMessage({ type: "error", code: "EXTRACTION_FAILED", message: "bad pdf" });`,
      ),
      {},
    );
    await expect(run).rejects.toMatchObject({ code: "EXTRACTION_FAILED", message: "bad pdf" });
    await expect(run).rejects.toBeInstanceOf(AppError);
  });

  it("rejects with a plain error for an uncaught exception in the worker", async () => {
    await expect(runInWorker(inline(`throw new Error("crash");`), {})).rejects.toThrow("crash");
  });

  it("terminates the worker and rejects with JobCancelled on abort", async () => {
    const controller = new AbortController();
    const run = runInWorker(
      inline(`setInterval(() => {}, 1000);`),
      {},
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 30);
    await expect(run).rejects.toBeInstanceOf(JobCancelled);
  });

  it("rejects right away when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runInWorker(
        inline(`parentPort.postMessage({ type: "result", value: 1 });`),
        {},
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(JobCancelled);
  });

  it("does not block the main event loop while a worker burns CPU (NFR-18)", async () => {
    const histogram = monitorEventLoopDelay({ resolution: 5 });
    histogram.enable();
    await runInWorker(
      inline(`const end = Date.now() + 400; while (Date.now() < end) {}
        parentPort.postMessage({ type: "result", value: "done" });`),
      {},
    );
    histogram.disable();
    // The busy loop lasts 400 ms; a blocked main thread would show a delay of that order.
    expect(histogram.max / 1e6).toBeLessThan(100);
  });
});
