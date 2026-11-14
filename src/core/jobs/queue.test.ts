/*
 * Filename: queue.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { AppError } from "../contracts/errors.js";
import { openWorkspaceDatabase } from "../db/databases.js";
import type { WorkspaceConnection } from "../db/databases.js";
import { tempDir } from "../test/helpers.js";
import { JobQueue } from "./queue.js";
import type { JobEvent } from "./queue.js";
import { getJob, listJobs, recoverInterrupted, setState } from "./store.js";
import { createJob } from "./store.js";

let connection: WorkspaceConnection;
let queue: JobQueue;
const events: JobEvent[] = [];

beforeEach(() => {
  events.length = 0;
  connection = openWorkspaceDatabase(join(tempDir(), "workspace.db"));
  queue = new JobQueue({
    maxConcurrent: 1,
    progressIntervalMs: 0,
    onEvent: (event) => events.push(event),
  });
});

afterEach(async () => {
  await queue.shutdown();
  connection.close();
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("JobQueue", () => {
  it("runs a job to done with progress and publishes events", async () => {
    const info = queue.submit(1, connection.db, "demo", async (context) => {
      context.update(0.5, "metade");
      context.update(1, "fim");
    });
    expect(info.state).toBe("queued");
    await queue.wait(1, info.id);
    const done = getJob(connection.db, info.id);
    expect(done).toMatchObject({ state: "done", progress: 1, message: "fim" });
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();
    expect(events.map((event) => event.type)).toContain("progress");
    expect(events.at(-1)).toMatchObject({ type: "finished", job: { state: "done" } });
  });

  it("marks an AppError as failed with its stable code", async () => {
    const info = queue.submit(1, connection.db, "demo", () => {
      throw new AppError("PROVIDER_ERROR", "O provedor falhou.");
    });
    await queue.wait(1, info.id);
    expect(getJob(connection.db, info.id)).toMatchObject({
      state: "failed",
      errorCode: "PROVIDER_ERROR",
      errorDetail: "O provedor falhou.",
    });
  });

  it("marks an unexpected error as failed with INTERNAL_ERROR", async () => {
    const info = queue.submit(1, connection.db, "demo", () => Promise.reject(new Error("boom")));
    await queue.wait(1, info.id);
    expect(getJob(connection.db, info.id)).toMatchObject({
      state: "failed",
      errorCode: "INTERNAL_ERROR",
      errorDetail: "boom",
    });
  });

  it("cancels a running job cooperatively", async () => {
    const info = queue.submit(1, connection.db, "demo", async (context) => {
      for (;;) {
        context.checkCancelled();
        await sleep(5);
      }
    });
    await sleep(20);
    expect(queue.cancel(1, info.id)).toBe(true);
    await queue.wait(1, info.id);
    expect(getJob(connection.db, info.id).state).toBe("cancelled");
    expect(queue.cancel(1, info.id)).toBe(false);
  });

  it("keeps a second job queued while the concurrency limit is reached", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = queue.submit(1, connection.db, "a", () => gate);
    const second = queue.submit(1, connection.db, "b", () => Promise.resolve());
    await sleep(20);
    expect(getJob(connection.db, first.id).state).toBe("running");
    expect(getJob(connection.db, second.id).state).toBe("queued");
    release();
    await queue.wait(1, second.id);
    expect(getJob(connection.db, first.id).state).toBe("done");
    expect(getJob(connection.db, second.id).state).toBe("done");
  });

  it("never runs a job cancelled before it started", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    queue.submit(1, connection.db, "a", () => gate);
    let ran = false;
    const second = queue.submit(1, connection.db, "b", () => {
      ran = true;
      return Promise.resolve();
    });
    expect(queue.cancel(1, second.id)).toBe(true);
    release();
    await queue.wait(1, second.id);
    expect(ran).toBe(false);
    expect(getJob(connection.db, second.id).state).toBe("cancelled");
  });

  it("cancels running jobs on shutdown", async () => {
    const info = queue.submit(1, connection.db, "demo", async (context) => {
      for (;;) {
        context.checkCancelled();
        await sleep(5);
      }
    });
    await sleep(20);
    await queue.shutdown();
    expect(getJob(connection.db, info.id).state).toBe("cancelled");
  });

  it("fails jobs that were active before a restart with INTERRUPTED", () => {
    const queued = createJob(connection.db, "a");
    const running = createJob(connection.db, "b");
    const done = createJob(connection.db, "c");
    setState(connection.db, running.id, "running");
    setState(connection.db, done.id, "done");
    expect(recoverInterrupted(connection.db)).toBe(2);
    expect(getJob(connection.db, queued.id)).toMatchObject({
      state: "failed",
      errorCode: "INTERRUPTED",
    });
    expect(getJob(connection.db, running.id).errorCode).toBe("INTERRUPTED");
    expect(getJob(connection.db, done.id).state).toBe("done");
  });

  it("reports an unknown job and lists the latest first", () => {
    expect(() => getJob(connection.db, 42)).toThrowError(AppError);
    const a = createJob(connection.db, "a");
    const b = createJob(connection.db, "b");
    expect(listJobs(connection.db).map((job) => job.id)).toEqual([b.id, a.id]);
  });
});
