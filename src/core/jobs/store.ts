/*
 * Filename: store.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq, inArray, desc } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import type { WorkspaceConnection } from "../db/databases.js";
import { job } from "../db/workspace-schema.js";

export type WorkspaceDb = WorkspaceConnection["db"];
export type JobState = "queued" | "running" | "done" | "failed" | "cancelled";

export const ACTIVE_STATES: readonly JobState[] = ["queued", "running"];

export interface JobInfo {
  id: number;
  type: string;
  state: JobState;
  progress: number;
  message: string;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function toInfo(row: typeof job.$inferSelect): JobInfo {
  return { ...row, state: row.state as JobState };
}

export function createJob(db: WorkspaceDb, type: string, clock: Clock = systemClock): JobInfo {
  const row = db
    .insert(job)
    .values({ type, createdAt: isoNow(clock) })
    .returning()
    .get();
  return toInfo(row);
}

export function getJob(db: WorkspaceDb, id: number): JobInfo {
  const row = db.select().from(job).where(eq(job.id, id)).get();
  if (!row) throw new AppError("JOB_NOT_FOUND", `Não existe tarefa com id ${id}.`);
  return toInfo(row);
}

export function listJobs(db: WorkspaceDb, limit = 50): JobInfo[] {
  return db.select().from(job).orderBy(desc(job.id)).limit(limit).all().map(toInfo);
}

export function setState(
  db: WorkspaceDb,
  id: number,
  state: JobState,
  options: { errorCode?: string; errorDetail?: string; clock?: Clock } = {},
): void {
  const at = isoNow(options.clock);
  const values: Partial<typeof job.$inferInsert> = { state };
  if (state === "running") values.startedAt = at;
  if (state === "done" || state === "failed" || state === "cancelled") values.finishedAt = at;
  if (state === "done") values.progress = 1;
  if (options.errorCode !== undefined) values.errorCode = options.errorCode;
  if (options.errorDetail !== undefined) values.errorDetail = options.errorDetail;
  db.update(job).set(values).where(eq(job.id, id)).run();
}

export function setProgress(db: WorkspaceDb, id: number, progress: number, message = ""): void {
  db.update(job)
    .set({ progress: Math.min(Math.max(progress, 0), 1), message })
    .where(eq(job.id, id))
    .run();
}

/** Marks jobs that were active before a restart as `failed` with the `INTERRUPTED` code. */
export function recoverInterrupted(db: WorkspaceDb, clock: Clock = systemClock): number {
  const result = db
    .update(job)
    .set({
      state: "failed",
      errorCode: "INTERRUPTED",
      errorDetail: "O aplicativo foi reiniciado durante a execução.",
      finishedAt: isoNow(clock),
    })
    .where(inArray(job.state, [...ACTIVE_STATES]))
    .run();
  return result.changes;
}
