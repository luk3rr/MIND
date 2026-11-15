/*
 * Filename: worker-reader.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { WorkerReader } from "./backend.js";
import type { ReaderReply, ReaderRequest } from "./backend.js";

/** A stand-in for a worker thread that answers through a script. */
class FakeWorker extends EventEmitter {
  readonly requests: ReaderRequest[] = [];
  terminated = false;
  constructor(private readonly answer: (request: ReaderRequest) => ReaderReply | null) {
    super();
  }
  postMessage(request: ReaderRequest): void {
    this.requests.push(request);
    const reply = this.answer(request);
    if (reply) queueMicrotask(() => this.emit("message", reply));
  }
  terminate(): Promise<number> {
    this.terminated = true;
    return Promise.resolve(0);
  }
}

const asWorker = (worker: FakeWorker): Worker => worker as unknown as Worker;

describe("WorkerReader (NFR-2)", () => {
  it("sends requests to one long-lived worker and matches the answers by id", async () => {
    const worker = new FakeWorker((request) => ({
      id: request.id,
      ok: true,
      value: request.args[0],
    }));
    let created = 0;
    const reader = new WorkerReader(() => {
      created += 1;
      return asWorker(worker);
    });
    const [first, second] = await Promise.all([
      reader.call("info", ["/a.pdf"]),
      reader.call("info", ["/b.pdf"]),
    ]);
    expect([first, second]).toEqual(["/a.pdf", "/b.pdf"]);
    expect(created).toBe(1);
    expect(worker.requests.map((request) => request.method)).toEqual(["info", "info"]);
    await reader.close();
    expect(worker.terminated).toBe(true);
  });

  it("turns a coded failure into an AppError and any other into an Error", async () => {
    const worker = new FakeWorker((request) =>
      request.method === "info"
        ? { id: request.id, ok: false, code: "PDF_PROTECTED", message: "senha" }
        : { id: request.id, ok: false, message: "boom" },
    );
    const reader = new WorkerReader(() => asWorker(worker));
    await expect(reader.call("info", ["/a.pdf"])).rejects.toMatchObject({ code: "PDF_PROTECTED" });
    await expect(reader.call("text", ["/a.pdf", 1])).rejects.toThrow("boom");
  });

  it("rejects pending calls when the worker dies and starts a new one for the next call", async () => {
    const dying = new FakeWorker(() => null);
    const healthy = new FakeWorker((request) => ({ id: request.id, ok: true, value: "ok" }));
    const workers = [dying, healthy];
    const reader = new WorkerReader(() => asWorker(workers.shift() as FakeWorker));
    const pending = reader.call("info", ["/a.pdf"]);
    dying.emit("exit", 1);
    await expect(pending).rejects.toThrow(/stopped/);
    expect(await reader.call("info", ["/a.pdf"])).toBe("ok");
  });

  it("rejects pending calls on close", async () => {
    const worker = new FakeWorker(() => null);
    const reader = new WorkerReader(() => asWorker(worker));
    const pending = reader.call("info", ["/a.pdf"]);
    await reader.close();
    await expect(pending).rejects.toThrow(/closed/);
  });
});
