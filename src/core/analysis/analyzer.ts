/*
 * Filename: analyzer.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { asc, eq } from "drizzle-orm";
import { isoNow } from "../clock.js";
import { AppError } from "../contracts/errors.js";
import type { Llm } from "../core.js";
import { chunk, material } from "../db/workspace-schema.js";
import { JobCancelled } from "../jobs/queue.js";
import type { JobContext, JobQueue } from "../jobs/queue.js";
import { getJob } from "../jobs/store.js";
import type { WorkspaceDb } from "../jobs/store.js";
import { logger } from "../logging.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import {
  buildClassifyMessages,
  classifyBatchSchema,
  cleanSubject,
  mergeWindows,
  windowsOf,
} from "./classifier.js";
import type { ClassifyBatch, Role, WindowResult } from "./classifier.js";
import type { Message } from "../llm/types.js";

const log = logger("analysis");

/** How many chunks one call of the model reads, and how many of them the next call reads again. */
export const WINDOW_SIZE = 12;
export const WINDOW_OVERLAP = 2;
/** How many windows are asked at the same time. */
export const ANALYSIS_CONCURRENCY = 3;
/** How many times a window is asked when the provider fails (a timeout, an answer that is not valid). */
export const WINDOW_ATTEMPTS = 3;
/** What one window may cost: twelve verdicts are short, and a reasoning model must not run on. */
export const WINDOW_MAX_TOKENS = 6000;

/** The job type of an analysis in the queue. */
export const ANALYSIS_JOB = "analysis";

export interface AnalysisInfo {
  /** none: never analyzed; analyzing: job active; done; failed; paused: monthly limit reached. */
  state: "none" | "analyzing" | "done" | "failed" | "paused";
  /** 0 to 1 while analyzing, otherwise null. */
  progress: number | null;
  errorCode: string | null;
  errorDetail: string | null;
  analyzedAt: string | null;
}

/**
 * The state of the analysis of a material, worked out from the end of the analysis and from its
 * job, never stored: the job is the truth, so a restart in the middle cannot leave "analyzing"
 * behind (the queue marks the interrupted job as failed).
 */
export function analysisOf(
  db: WorkspaceDb,
  row: { analyzedAt: string | null; analysisJobId: number | null },
): AnalysisInfo {
  const info = (state: AnalysisInfo["state"], extra: Partial<AnalysisInfo> = {}): AnalysisInfo => ({
    state,
    progress: null,
    errorCode: null,
    errorDetail: null,
    analyzedAt: row.analyzedAt,
    ...extra,
  });
  if (row.analyzedAt !== null) return info("done");
  if (row.analysisJobId === null) return info("none");
  let job;
  try {
    job = getJob(db, row.analysisJobId);
  } catch {
    return info("none");
  }
  if (job.state === "queued" || job.state === "running") {
    return info("analyzing", { progress: job.progress });
  }
  if (job.state === "failed") {
    const paused = job.errorCode === "MONTHLY_LIMIT_REACHED";
    return info(paused ? "paused" : "failed", {
      errorCode: job.errorCode,
      errorDetail: job.errorDetail,
    });
  }
  if (job.state === "cancelled") {
    return info("failed", { errorCode: "CANCELLED", errorDetail: "A análise foi cancelada." });
  }
  // A finished job that left no end behind: nothing was analyzed.
  return info("none");
}

/**
 * Reads the chunks of a material in windows and says what each one is (concept, exam question,
 * motivating text...), which chunks belong together, and what the material is about. It runs as a
 * background job with the judge model; the result lives on the chunks and on the material.
 */
export class MaterialAnalyzer {
  private readonly db: WorkspaceDb;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly queue: JobQueue,
    private readonly llm: Llm,
    private readonly options: { windowSize?: number; overlap?: number; concurrency?: number } = {},
  ) {
    this.db = workspace.connection.db;
  }

  /** The state of the analysis of one material. */
  status(materialId: number): AnalysisInfo {
    const row = this.db.select().from(material).where(eq(material.id, materialId)).get();
    if (!row) throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${materialId}.`);
    return analysisOf(this.db, row);
  }

  /**
   * Queues the analysis of an indexed material. Does nothing when one is already running. With
   * `automatic` a missing key or consent only means no analysis (the person did not ask for it);
   * otherwise the error reaches the caller.
   */
  start(
    materialId: number,
    options: { automatic?: boolean } = {},
  ): { started: boolean; analysis: AnalysisInfo } {
    const row = this.db.select().from(material).where(eq(material.id, materialId)).get();
    if (!row) throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${materialId}.`);
    if (row.status !== "indexed") {
      throw new AppError("VALIDATION_ERROR", "O material ainda não foi indexado.", [
        { field: "id", message: "Aguarde a importação terminar." },
      ]);
    }
    const current = analysisOf(this.db, row);
    if (current.state === "analyzing") return { started: false, analysis: current };
    const total = this.db
      .select({ id: chunk.id })
      .from(chunk)
      .where(eq(chunk.materialId, materialId))
      .all().length;
    if (total === 0) {
      this.db
        .update(material)
        .set({ analyzedAt: isoNow() })
        .where(eq(material.id, materialId))
        .run();
      return { started: false, analysis: this.status(materialId) };
    }
    try {
      this.llm.ensureReady();
    } catch (error) {
      if (options.automatic === true && error instanceof AppError) {
        log.info("analysis not started", { material: materialId, code: error.code });
        return { started: false, analysis: current };
      }
      throw error;
    }
    const job = this.queue.submit(this.workspace.info.id, this.db, ANALYSIS_JOB, (context) =>
      this.run(materialId, context),
    );
    this.db
      .update(material)
      .set({ analysisJobId: job.id, analyzedAt: null })
      .where(eq(material.id, materialId))
      .run();
    return { started: true, analysis: this.status(materialId) };
  }

  /**
   * One call of the model for one window. A failure of the provider (a timeout, which a model
   * that reasons for too long causes, or an answer that is not valid) is tried again; a limit, a
   * missing key or a cancellation never is.
   */
  private async ask(
    messages: Message[],
    model: string,
    context: JobContext,
  ): Promise<ClassifyBatch> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const { value } = await this.llm.provider.complete(messages, classifyBatchSchema, {
          model,
          purpose: "analysis",
          schemaName: "ClassifyBatch",
          maxTokens: WINDOW_MAX_TOKENS,
          reasoningEffort: "low",
        });
        return value;
      } catch (error) {
        const again =
          error instanceof AppError && error.code === "PROVIDER_ERROR" && attempt < WINDOW_ATTEMPTS;
        if (!again) throw error;
        context.checkCancelled();
        log.warn("analysis window tried again", { attempt });
      }
    }
  }

  private async run(materialId: number, context: JobContext): Promise<void> {
    const started = performance.now();
    const model = this.llm.settings.get().judgeModel;
    const chunks = this.db
      .select({ id: chunk.id, text: chunk.text })
      .from(chunk)
      .where(eq(chunk.materialId, materialId))
      .orderBy(asc(chunk.ordinal))
      .all();
    const size = this.options.windowSize ?? WINDOW_SIZE;
    const windows = windowsOf(chunks.length, size, this.options.overlap ?? WINDOW_OVERLAP);
    log.info("analysis started", {
      material: materialId,
      chunks: chunks.length,
      windows: windows.length,
    });
    // A window whose chunks were all classified by an earlier try is not asked again (the first
    // one always is: it is where the subject comes from), so a new request after a failure only
    // does what is left.
    const stored = this.db
      .select({ role: chunk.role, startsUnit: chunk.startsUnit })
      .from(chunk)
      .where(eq(chunk.materialId, materialId))
      .orderBy(asc(chunk.ordinal))
      .all();
    const results: WindowResult[] = [];
    const pending: number[] = [];
    for (const [index, window] of windows.entries()) {
      const rows = stored.slice(window.start, window.start + window.length);
      const known = index > 0 && rows.every((row) => row.role !== null);
      if (known) {
        results[index] = {
          start: window.start,
          length: window.length,
          verdicts: rows.map((row, position) => ({
            index: position,
            role: row.role as Role,
            starts_unit: row.startsUnit === 1,
          })),
        };
      } else {
        pending.push(index);
      }
    }
    let subject: string | null = null;
    let finished = windows.length - pending.length;
    let failure: unknown = null;
    const runWindow = async (index: number): Promise<void> => {
      const window = windows[index] as (typeof windows)[number];
      const part = chunks.slice(window.start, window.start + window.length);
      const value = await this.ask(
        buildClassifyMessages(
          part.map((c) => c.text),
          { number: index + 1, of: windows.length },
        ),
        model,
        context,
      );
      results[index] = { start: window.start, length: window.length, verdicts: value.chunks };
      if (index === 0) subject = cleanSubject(value.subject);
      // What each window found is kept as soon as it is known, so a failure later on does not
      // lose it; the end of the analysis (`analyzed_at`) is only set when every window is in.
      this.workspace.connection.sqlite.transaction(() => {
        for (const verdict of value.chunks) {
          const target = part[verdict.index];
          if (!target) continue;
          this.db
            .update(chunk)
            .set({ role: verdict.role, startsUnit: verdict.starts_unit ? 1 : 0 })
            .where(eq(chunk.id, target.id))
            .run();
        }
      })();
      finished += 1;
      context.update(finished / windows.length, `parte ${finished} de ${windows.length}`);
    };
    // A few windows at a time; the first failure (after the tries of its window) stops the rest.
    const next = [...pending];
    const workers = Array.from(
      { length: Math.min(this.options.concurrency ?? ANALYSIS_CONCURRENCY, next.length) },
      async () => {
        for (;;) {
          const index = next.shift();
          if (index === undefined || failure !== null) return;
          context.checkCancelled();
          try {
            await runWindow(index);
          } catch (error) {
            failure ??= error;
            return;
          }
        }
      },
    );
    await Promise.all(workers);
    if (failure !== null) throw failure;
    if (context.signal.aborted) throw new JobCancelled();
    const merged = mergeWindows(results, chunks.length);
    this.workspace.connection.sqlite.transaction(() => {
      merged.forEach((entry, position) => {
        const target = chunks[position];
        if (!target) return;
        this.db
          .update(chunk)
          .set({ role: entry.role, startsUnit: entry.startsUnit ? 1 : 0, unit: entry.unit })
          .where(eq(chunk.id, target.id))
          .run();
      });
      this.db
        .update(material)
        .set({ subjectInferred: subject, analyzedAt: isoNow() })
        .where(eq(material.id, materialId))
        .run();
    })();
    context.update(1, "análise concluída");
    log.info("analysis finished", {
      material: materialId,
      windows: windows.length,
      units: merged.at(-1)?.unit ?? 0,
      ms: Math.round(performance.now() - started),
    });
  }
}
