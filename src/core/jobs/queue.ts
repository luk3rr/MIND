/*
 * Filename: queue.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import * as store from "./store.js";
import type { JobInfo, WorkspaceDb } from "./store.js";

/** Thrown by `JobContext.checkCancelled` when the job was cancelled. */
export class JobCancelled extends Error {
  constructor() {
    super("Job cancelled");
    this.name = "JobCancelled";
  }
}

export interface JobEvent {
  type: "progress" | "finished";
  workspaceId: number;
  job: JobInfo;
}

/** Passed to the job work to report progress and check for cancellation. */
export class JobContext {
  private lastWrite = Number.NEGATIVE_INFINITY;

  constructor(
    readonly jobId: number,
    readonly signal: AbortSignal,
    private readonly report: (progress: number, message: string) => void,
    private readonly intervalMs: number,
  ) {}

  /** Records progress (0 to 1); writes are throttled except for the final 100%. */
  update(progress: number, message = ""): void {
    const at = performance.now();
    if (progress >= 1 || at - this.lastWrite >= this.intervalMs) {
      this.lastWrite = at;
      this.report(progress, message);
    }
  }

  checkCancelled(): void {
    if (this.signal.aborted) throw new JobCancelled();
  }
}

export type JobWork = (context: JobContext) => Promise<void>;

export interface QueueOptions {
  maxConcurrent?: number;
  progressIntervalMs?: number;
  clock?: Clock;
  onEvent?: (event: JobEvent) => void;
}

interface Active {
  controller: AbortController;
  done: Promise<void>;
}

/** In-process job queue with state persisted in each workspace database. */
export class JobQueue {
  private readonly maxConcurrent: number;
  private readonly intervalMs: number;
  private readonly clock: Clock;
  private readonly onEvent: ((event: JobEvent) => void) | undefined;
  private running = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly active = new Map<string, Active>();

  constructor(options: QueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.intervalMs = options.progressIntervalMs ?? 250;
    this.clock = options.clock ?? systemClock;
    this.onEvent = options.onEvent;
  }

  submit(workspaceId: number, db: WorkspaceDb, type: string, work: JobWork): JobInfo {
    const info = store.createJob(db, type, this.clock);
    const controller = new AbortController();
    const key = `${workspaceId}:${info.id}`;
    const done = this.run(workspaceId, db, info.id, controller, work).finally(() => {
      this.active.delete(key);
    });
    this.active.set(key, { controller, done });
    return info;
  }

  /** Requests cancellation; returns false when the job is not active in this queue. */
  cancel(workspaceId: number, jobId: number): boolean {
    const entry = this.active.get(`${workspaceId}:${jobId}`);
    if (!entry) return false;
    entry.controller.abort();
    return true;
  }

  async wait(workspaceId: number, jobId: number): Promise<void> {
    await this.active.get(`${workspaceId}:${jobId}`)?.done;
  }

  /** Cancels every active job and waits for them to settle. */
  async shutdown(): Promise<void> {
    const entries = [...this.active.values()];
    entries.forEach((entry) => entry.controller.abort());
    await Promise.allSettled(entries.map((entry) => entry.done));
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running -= 1;
  }

  private emit(type: JobEvent["type"], workspaceId: number, db: WorkspaceDb, id: number): void {
    if (this.onEvent) this.onEvent({ type, workspaceId, job: store.getJob(db, id) });
  }

  private async run(
    workspaceId: number,
    db: WorkspaceDb,
    id: number,
    controller: AbortController,
    work: JobWork,
  ): Promise<void> {
    const options = { clock: this.clock };
    await this.acquire();
    try {
      if (controller.signal.aborted) {
        store.setState(db, id, "cancelled", options);
        return;
      }
      store.setState(db, id, "running", options);
      const context = new JobContext(
        id,
        controller.signal,
        (progress, message) => {
          store.setProgress(db, id, progress, message);
          this.emit("progress", workspaceId, db, id);
        },
        this.intervalMs,
      );
      try {
        await work(context);
        store.setState(db, id, controller.signal.aborted ? "cancelled" : "done", options);
      } catch (error) {
        if (error instanceof JobCancelled) {
          store.setState(db, id, "cancelled", options);
        } else if (error instanceof AppError) {
          store.setState(db, id, "failed", {
            ...options,
            errorCode: error.code,
            errorDetail: error.message,
          });
        } else {
          store.setState(db, id, "failed", {
            ...options,
            errorCode: "INTERNAL_ERROR",
            errorDetail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.release();
      this.emit("finished", workspaceId, db, id);
    }
  }
}
