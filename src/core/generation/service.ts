/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { desc, eq, ne } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import type { FieldError } from "../contracts/errors.js";
import { generationRun, material } from "../db/workspace-schema.js";
import { JobCancelled } from "../jobs/queue.js";
import { getJob } from "../jobs/store.js";
import type { JobContext, JobQueue } from "../jobs/queue.js";
import type { Llm } from "../core.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { CardGenerator } from "./cards.js";
import type { BatchOutcome, DiscardNote } from "./cards.js";
import { CARDS_PER_BATCH, QUESTIONS_PER_BATCH, planBatches, selectChunks } from "./planning.js";
import { QuestionGenerator } from "./questions.js";
import { JUDGE_SYSTEM, PROFILE_RULES, QUESTION_SYSTEM } from "./question-prompts.js";
import type { SourceChunk } from "./planning.js";
import { SUBTYPE_RULES, SYSTEM } from "./prompts.js";
import { CARD_SUBTYPES, PROFILES } from "./schemas.js";
import { isoNow } from "../clock.js";
import { trainingMaterial } from "./training.js";

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = { card: 60, question: 30 } as const;
export const OUTPUT_TOKENS_PER_QUESTION = 250;
export const JUDGE_TOKENS_PER_QUESTION = 60;
export const OUTPUT_TOKENS_PER_CARD = 150;
export const PROMPT_OVERHEAD_CHARS = 400;
export const CONCURRENT_BATCHES = 2;
const LOG_LIMIT = 20;

export interface GenerationRequest {
  /** The material to generate from; omitted when training on `topicId`. */
  materialId?: number | null;
  subtype: string;
  quantity: number;
  kind: "card" | "question";
  pageFrom?: number;
  pageTo?: number;
  topicId?: number | null;
}

export interface EstimateInfo {
  estimatedUsd: number | null;
  chunks: number;
  batches: number;
  promptChars: number;
}

export interface RunInfo {
  id: number;
  kind: string;
  subtype: string;
  materialId: number | null;
  pageFrom: number | null;
  pageTo: number | null;
  topicId: number | null;
  model: string;
  requested: number;
  generated: number;
  discardedNoSource: number;
  discardedInvalid: number;
  discardedDuplicate: number;
  discardedUnsupported: number;
  approved: number;
  approvedUnedited: number;
  discardedReview: number;
  costUsd: number;
  status: string;
  discardLog: DiscardNote[];
  errorCode: string | null;
  errorDetail: string | null;
  jobId: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface RunView extends RunInfo {
  progress: number | null;
}

function toInfo(row: typeof generationRun.$inferSelect): RunInfo {
  return {
    id: row.id,
    kind: row.kind,
    subtype: row.subtype,
    materialId: row.materialId,
    pageFrom: row.pageFrom,
    pageTo: row.pageTo,
    topicId: row.topicId,
    model: row.model,
    requested: row.requested,
    generated: row.generated,
    discardedNoSource: row.discardedNoSource,
    discardedInvalid: row.discardedInvalid,
    discardedDuplicate: row.discardedDuplicate,
    discardedUnsupported: row.discardedUnsupported,
    approved: row.approved,
    approvedUnedited: row.approvedUnedited,
    discardedReview: row.discardedReview,
    costUsd: row.costUsd,
    status: row.status,
    discardLog: JSON.parse(row.discardLog) as DiscardNote[],
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
    jobId: row.jobId,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export function validateRequest(request: GenerationRequest): void {
  const errors: FieldError[] = [];
  if ((request.materialId ?? null) === null && (request.topicId ?? null) === null) {
    errors.push({ field: "materialId", message: "Escolha um material ou um tópico para treinar." });
  }
  const kinds = Object.keys(MAX_QUANTITY);
  if (!kinds.includes(request.kind)) {
    errors.push({ field: "kind", message: "Escolha cards ou questões." });
  } else {
    const allowed =
      request.kind === "card" ? (CARD_SUBTYPES as readonly string[]) : Object.keys(PROFILES);
    if (!allowed.includes(request.subtype)) {
      const label = request.kind === "card" ? "Tipo de card" : "Perfil de questão";
      errors.push({ field: "subtype", message: `${label} desconhecido.` });
    }
    const top = MAX_QUANTITY[request.kind];
    if (
      !Number.isInteger(request.quantity) ||
      request.quantity < MIN_QUANTITY ||
      request.quantity > top
    ) {
      const name = request.kind === "card" ? "cards" : "questões";
      errors.push({ field: "quantity", message: `Peça de ${MIN_QUANTITY} a ${top} ${name}.` });
    }
  }
  if (request.pageFrom !== undefined && request.pageFrom < 1) {
    errors.push({ field: "pageFrom", message: "A primeira página é 1." });
  }
  if (
    request.pageFrom !== undefined &&
    request.pageTo !== undefined &&
    request.pageTo < request.pageFrom
  ) {
    errors.push({ field: "pageTo", message: "A página final vem antes da inicial." });
  }
  if (errors.length > 0)
    throw new AppError("VALIDATION_ERROR", "Pedido de geração inválido.", errors);
}

function perBatch(kind: "card" | "question"): number {
  return kind === "question" ? QUESTIONS_PER_BATCH : CARDS_PER_BATCH;
}

/** Generates drafts for one workspace: plans batches, calls the model and tracks the run. */
export class GenerationService {
  private readonly generator: CardGenerator;
  private readonly questionGenerator: QuestionGenerator;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly queue: JobQueue,
    private readonly llm: Llm,
    private readonly concurrency = CONCURRENT_BATCHES,
  ) {
    this.generator = new CardGenerator(
      workspace.connection.db,
      workspace.connection.sqlite,
      llm.provider,
    );
    this.questionGenerator = new QuestionGenerator(
      workspace.connection.db,
      workspace.connection.sqlite,
      llm.provider,
    );
  }

  private get db() {
    return this.workspace.connection.db;
  }

  private chunksFor(request: GenerationRequest): SourceChunk[] {
    if ((request.topicId ?? null) !== null) {
      const training = trainingMaterial(this.workspace.connection, request.topicId as number);
      if (training.chunks.length === 0) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Não há trechos de origem para treinar este tópico.",
          [{ field: "topicId", message: "Importe material que fale deste tópico." }],
        );
      }
      return training.chunks;
    }
    const materialId = request.materialId as number;
    const row = this.db.select().from(material).where(eq(material.id, materialId)).get();
    if (!row) {
      throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${materialId}.`);
    }
    if (row.status !== "indexed") {
      throw new AppError("VALIDATION_ERROR", "O material ainda não foi indexado.", [
        { field: "materialId", message: "Aguarde a importação terminar." },
      ]);
    }
    const chunks = selectChunks(this.db, materialId, request.pageFrom, request.pageTo);
    if (chunks.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Não há texto nesse recorte do material.", [
        { field: "pageFrom", message: "Escolha outro intervalo de páginas." },
      ]);
    }
    return chunks;
  }

  estimate(request: GenerationRequest): EstimateInfo {
    validateRequest(request);
    const plan = planBatches(
      this.chunksFor(request),
      request.quantity,
      perBatch(request.kind),
      (request.topicId ?? null) === null,
    );
    const settings = this.llm.settings.get();
    const chunkChars = plan.reduce(
      (total, batch) => total + batch.chunks.reduce((sum, c) => sum + c.text.length, 0),
      0,
    );
    if (request.kind === "question") {
      const system = QUESTION_SYSTEM.length + (PROFILE_RULES[request.subtype]?.length ?? 0);
      let promptChars = plan.length * (system + PROMPT_OVERHEAD_CHARS) + chunkChars;
      // The judge reads, for each question, its source excerpt (about one chunk).
      const judgeChars = plan.reduce(
        (total, batch) =>
          total +
          batch.count * (JUDGE_SYSTEM.length + PROMPT_OVERHEAD_CHARS) +
          batch.count *
            Math.floor(
              batch.chunks.reduce((sum, c) => sum + c.text.length, 0) /
                Math.max(batch.chunks.length, 1),
            ),
        0,
      );
      const generation = this.llm.catalog.estimate(
        settings.generationModel,
        promptChars,
        request.quantity * OUTPUT_TOKENS_PER_QUESTION,
      );
      const judging = this.llm.catalog.estimate(
        settings.judgeModel,
        judgeChars,
        request.quantity * JUDGE_TOKENS_PER_QUESTION,
      );
      promptChars += judgeChars;
      return {
        estimatedUsd: generation === null || judging === null ? null : generation + judging,
        chunks: plan.reduce((total, batch) => total + batch.chunks.length, 0),
        batches: plan.length,
        promptChars,
      };
    }
    const promptChars =
      plan.length *
        (SYSTEM.length + (SUBTYPE_RULES[request.subtype]?.length ?? 0) + PROMPT_OVERHEAD_CHARS) +
      chunkChars;
    return {
      estimatedUsd: this.llm.catalog.estimate(
        settings.generationModel,
        promptChars,
        request.quantity * OUTPUT_TOKENS_PER_CARD,
      ),
      chunks: plan.reduce((total, batch) => total + batch.chunks.length, 0),
      batches: plan.length,
      promptChars,
    };
  }

  /** Validates, creates the run and queues the job. */
  start(request: GenerationRequest): RunInfo {
    validateRequest(request);
    this.chunksFor(request);
    this.llm.ensureReady();
    const configured = this.llm.settings.get();
    const model = configured.generationModel;
    const row = this.db
      .insert(generationRun)
      .values({
        kind: request.kind,
        subtype: request.subtype,
        materialId: (request.topicId ?? null) === null ? (request.materialId ?? null) : null,
        pageFrom: request.pageFrom ?? null,
        pageTo: request.pageTo ?? null,
        topicId: request.topicId ?? null,
        model,
        requested: request.quantity,
        status: "queued",
      })
      .returning()
      .get();
    const job = this.queue.submit(
      this.workspace.info.id,
      this.db,
      `generate_${request.kind}s`,
      (context) => this.run(row.id, request, model, configured.judgeModel, context),
    );
    this.db.update(generationRun).set({ jobId: job.id }).where(eq(generationRun.id, row.id)).run();
    return this.get(row.id);
  }

  cancel(runId: number): boolean {
    const run = this.get(runId);
    return run.jobId === null ? false : this.queue.cancel(this.workspace.info.id, run.jobId);
  }

  private async run(
    runId: number,
    request: GenerationRequest,
    model: string,
    judgeModel: string,
    context: JobContext,
  ): Promise<void> {
    this.setStatus(runId, "running");
    const plan = planBatches(
      this.chunksFor(request),
      request.quantity,
      perBatch(request.kind),
      (request.topicId ?? null) === null,
    );
    const avoid =
      (request.topicId ?? null) === null
        ? []
        : trainingMaterial(this.workspace.connection, request.topicId as number).avoid;
    let accepted = 0;
    let finished = 0;
    let active = 0;
    const waiting: (() => void)[] = [];
    const acquire = async (): Promise<void> => {
      if (active < this.concurrency) {
        active += 1;
        return;
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
    };
    const release = (): void => {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    };

    const runBatch = async (chunks: SourceChunk[], count: number): Promise<void> => {
      await acquire();
      try {
        context.checkCancelled();
        const remaining = (): number => request.quantity - accepted;
        const outcome =
          request.kind === "question"
            ? await this.questionGenerator.generateBatch({
                runId,
                profile: request.subtype,
                count,
                chunks,
                model,
                judgeModel,
                remaining,
                topicId: request.topicId ?? null,
                avoid,
              })
            : await this.generator.generateBatch({
                runId,
                subtype: request.subtype,
                count,
                chunks,
                model,
                remaining,
                topicId: request.topicId ?? null,
                avoid,
              });
        accepted += outcome.accepted;
        finished += 1;
        this.addOutcome(runId, outcome);
        context.update(finished / plan.length, `lote ${finished} de ${plan.length}`);
      } finally {
        release();
      }
    };

    const results = await Promise.allSettled(
      plan.map((batch) => runBatch(batch.chunks, batch.count)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (!failure) {
      this.finish(runId, "done");
      return;
    }
    const reason = (failure as PromiseRejectedResult).reason as unknown;
    if (reason instanceof JobCancelled) this.finish(runId, "cancelled");
    else if (reason instanceof AppError) this.finish(runId, "partial", reason.code, reason.message);
    else
      this.finish(
        runId,
        "partial",
        "INTERNAL_ERROR",
        reason instanceof Error ? reason.message : String(reason),
      );
    throw reason;
  }

  private setStatus(runId: number, status: string): void {
    this.db.update(generationRun).set({ status }).where(eq(generationRun.id, runId)).run();
  }

  private finish(runId: number, status: string, errorCode?: string, errorDetail?: string): void {
    this.db
      .update(generationRun)
      .set({
        status,
        errorCode: errorCode ?? null,
        errorDetail: errorDetail ?? null,
        finishedAt: isoNow(),
      })
      .where(eq(generationRun.id, runId))
      .run();
  }

  private addOutcome(runId: number, outcome: BatchOutcome): void {
    const row = this.db.select().from(generationRun).where(eq(generationRun.id, runId)).get();
    if (!row) return;
    const log = JSON.parse(row.discardLog) as DiscardNote[];
    const room = LOG_LIMIT - log.length;
    this.db
      .update(generationRun)
      .set({
        generated: row.generated + outcome.accepted,
        discardedNoSource: row.discardedNoSource + outcome.noSource,
        discardedInvalid: row.discardedInvalid + outcome.invalid,
        discardedDuplicate: row.discardedDuplicate + outcome.duplicate,
        discardedUnsupported: row.discardedUnsupported + outcome.unsupported,
        costUsd: row.costUsd + outcome.costUsd,
        ...(room > 0
          ? { discardLog: JSON.stringify([...log, ...outcome.log.slice(0, room)]) }
          : {}),
      })
      .where(eq(generationRun.id, runId))
      .run();
  }

  /** A run with the progress of its job while it is active. */
  view(run: RunInfo): RunView {
    const active = ["queued", "running"].includes(run.status) && run.jobId !== null;
    return { ...run, progress: active ? getJob(this.db, run.jobId as number).progress : null };
  }

  get(runId: number): RunInfo {
    const row = this.db.select().from(generationRun).where(eq(generationRun.id, runId)).get();
    if (!row) throw new AppError("RUN_NOT_FOUND", `Não existe geração com id ${runId}.`);
    return toInfo(row);
  }

  listRuns(limit = 20): RunInfo[] {
    return this.db
      .select()
      .from(generationRun)
      .where(ne(generationRun.kind, "notebook"))
      .orderBy(desc(generationRun.id))
      .limit(limit)
      .all()
      .map(toInfo);
  }
}
