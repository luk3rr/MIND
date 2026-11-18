/*
 * Filename: fake-mind.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { vi } from "vitest";
import type { MindApi } from "../../core/contracts/api.js";
import type { ChannelName, ErrorInfo, InputOf, OutputOf } from "../../core/contracts/index.js";
import { ok } from "../../core/contracts/index.js";
import type { Result } from "../../core/contracts/index.js";

interface Workspace {
  id: number;
  name: string;
  createdAt: string;
}

export type ProviderState = FakeState["provider"];
export type FakeMaterial = OutputOf<"material:list">["materials"][number];
type FakeChunk = OutputOf<"material:chunks">["chunks"][number];
/** A run as a test seeds it; the fake adds the number of pending drafts from the items. */
export type FakeRun = Omit<OutputOf<"generation:list">["runs"][number], "pending">;
export type FakeItem = OutputOf<"review:list">["items"][number];
export type FakeStudySettings = OutputOf<"study:today">["settings"];
export const DEFAULT_STUDY_SETTINGS: FakeStudySettings = {
  newPerDay: 20,
  dailyGoal: 40,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: "1m 10m",
  relearningSteps: "10m",
  enableFuzz: true,
};
export type FakePracticeSettings = OutputOf<"practice:settings">["settings"];
export const DEFAULT_PRACTICE_SETTINGS: FakePracticeSettings = {
  feedback: "immediate",
  confidence: false,
  interleave: false,
};
export type FakeStudyCard = NonNullable<OutputOf<"study:next">["card"]>;
export type FakeErrorEntry = OutputOf<"errors:list">["entries"][number];
export type FakeTopic = OutputOf<"topics:list">["topics"][number];
export type FakeOverview = OutputOf<"stats:overview">;
export type FakeReply = OutputOf<"chat:ask">;
export type FakeEmbeddings = OutputOf<"embeddings:status">;
export type FakeTime = OutputOf<"time:state">;
export type FakeQuestion = NonNullable<OutputOf<"practice:next">["question"]>;

export interface FakeState {
  workspaces: Workspace[];
  route: string | null;
  summary: OutputOf<"today:summary"> | ErrorInfo;
  nextId: number;
  materials: FakeMaterial[];
  chunks: FakeChunk[];
  runs: FakeRun[];
  items: FakeItem[];
  /** Makes the next generation requests fail with this error on one field. */
  generationError?: { field: string; message: string };
  /**
   * What choosing a file for import gives: the rows of the preview, or an error, or a cancelled
   * dialog. `discarded` collects the tokens the window threw away.
   */
  importFile?: {
    fileName?: string;
    rows?: OutputOf<"import:previewRows">["rows"];
    newTopics?: string[];
    error?: { code: ErrorInfo["code"]; message: string };
    cancel?: boolean;
    gate?: Promise<void>;
  };
  discarded?: string[];
  /** The confirmations the window sent, newest last; `commitError` makes the next one fail. */
  commits?: { token: string; includeDuplicates: number[] }[];
  commitError?: { code: ErrorInfo["code"]; message: string };
  commitGate?: Promise<void>;
  /** The templates the person saved, newest last; `cancelTemplate` makes the dialog return nothing. */
  templates?: { kind: "card" | "question"; format: "csv" | "xlsx" }[];
  cancelTemplate?: boolean;
  /**
   * Cards that come back later today: while set, the queue is empty and the answer says when;
   * asking `early` serves `cards` instead. Set `cards` to what the early study gives.
   */
  waitingCards?: { due: string; cards: FakeStudyCard[] };
  /** What generating from a passage answers: drafts, or an error. Defaults to two cards. */
  selection?: {
    drafts?: OutputOf<"selection:generate">["drafts"];
    discarded?: OutputOf<"selection:generate">["discarded"];
    error?: { code: ErrorInfo["code"]; message: string };
    gate?: Promise<void>;
  };
  /** What "improve with the model" answers: a proposal, or an error. Defaults to a marked copy. */
  assist?: {
    proposal?: OutputOf<"assist:improve">["proposal"];
    error?: { code: ErrorInfo["code"]; message: string; field?: string };
    /** Holds the answer until the test calls it, to see the waiting state. */
    gate?: Promise<void>;
  };
  /** What the Items screen lists; the bulk actions change it. */
  catalog?: OutputOf<"items:list">["items"];
  estimateUsd: number | null;
  /** The cards the study queue serves, in order; rating one removes it. */
  studyQueue: FakeStudyCard[];
  /** New cards held back by the daily limit; "study more" lets them in. */
  studyHeldBack?: FakeStudyCard[];
  releasedExtra?: number;
  /** The study settings the settings form saves. */
  studySettings?: FakeStudySettings;
  /** The study practices the settings form saves. */
  practiceSettings?: FakePracticeSettings;
  reviewedToday: number;
  undoStack: FakeStudyCard[];
  /** Questions the practice queue serves; answering one removes it. */
  questions: FakeQuestion[];
  answerKeys: Record<number, string>;
  answeredToday: number;
  errorEntries: FakeErrorEntry[];
  topicList: FakeTopic[];
  /** Topics of the study and practice filters; one "Biologia" topic when not given. */
  facetTopics?: { key: number; label: string; count: number }[];
  /** Filters the screens remember, by local storage key. */
  rememberedFilters?: Record<string, string>;
  overview: FakeOverview;
  /** What the per-material progress table shows. */
  materialStats?: OutputOf<"stats:materials">["materials"];
  madeCards: number[];
  chat: FakeReply[];
  /** What the next question gets; the default answers with one valid citation. */
  chatReply: ((question: string) => Omit<FakeReply, "id" | "question" | "createdAt">) | null;
  embeddings: FakeEmbeddings;
  /** When set, enabling the semantic search fails with this message. */
  embeddingsFailure: string | null;
  /** Where the next export "saves"; null means the user cancels the dialog. */
  exportPath: string | null;
  /** Name of the workspace the next import creates; null means the user cancels the dialog. */
  importName: string | null;
  backupFailure: string | null;
  importResult: OutputOf<"material:import">;
  searchHits: OutputOf<"material:search">["hits"];
  reader: {
    info: OutputOf<"reader:info">;
    /** Text lines by page number; a page without lines has no text. */
    lines: Record<number, OutputOf<"reader:text">["lines"]>;
    hits: OutputOf<"reader:search">["hits"];
    /** The boxes `reader:locate` answers with. */
    cited: OutputOf<"reader:locate">["rects"];
    /** The pages saved as the reading position, in order. */
    saved: number[];
    /** When set, every reader call fails with this error. */
    failure: ErrorInfo | null;
  };
  /** How many questions answered wrongly are waiting to be redone. */
  practiceRetry: number;
  /** Windows and system viewers the user asked for, newest last. */
  opened: {
    kind: "window" | "system" | "release";
    materialId: number;
    page?: number;
    quote?: string;
  }[];
  update: OutputOf<"update:state">;
  /** The release the next "check" finds; null means the app is up to date. */
  updateFound: { version: string; url: string } | null;
  /** When true the check fails (no connection). */
  updateFails: boolean;
  /** When set, opening a window or a file fails with this message. */
  openFailure: string | null;
  time: FakeTime;
  timeSettings: OutputOf<"time:getSettings">;
  timeStats: OutputOf<"time:stats">;
  timeSessions: OutputOf<"time:sessions">["sessions"];
  provider: {
    apiKey: string | null;
    keySource: "environment" | "stored" | null;
    consentGiven: boolean;
    generationModel: string;
    judgeModel: string;
    monthlyLimitUsd: number;
    spentThisMonth: number;
    knownModels: string[];
    lines: OutputOf<"settings:getCost">["lines"];
    refreshWorks: boolean;
    /** What the connection test answers; null means it works. */
    connectionError?: string | null;
  };
}

export function emptyOverview(): FakeOverview {
  return {
    summary: {
      reviewedToday: 0,
      answeredToday: 0,
      activityToday: 0,
      goal: 40,
      goalMet: false,
      currentStreak: 0,
      longestStreak: 0,
      totalReviews: 0,
      totalAttempts: 0,
    },
    topics: [],
    weakest: [],
    retention: { rate: null, reviews: 0, days: [] },
    activity: [],
  };
}

function studyCounts(state: FakeState) {
  return {
    learning: 0,
    review: 0,
    newAvailable: state.studyQueue.length,
    newWaiting: state.studyHeldBack?.length ?? 0,
    reviewedToday: state.reviewedToday,
    newStudiedToday: state.reviewedToday,
    toStudy: state.studyQueue.length,
  };
}

function withPending(state: FakeState, run: FakeRun) {
  const pending = state.items.filter((i) => i.runId === run.id && i.status === "draft").length;
  return { ...run, pending };
}

function practiceCounts(state: FakeState) {
  return {
    unseen: state.questions.length,
    retry: state.practiceRetry,
    answeredToday: state.answeredToday,
    correctToday: 0,
    toPractice: state.questions.length,
  };
}

export function idleTime(overrides: Partial<FakeTime> = {}): FakeTime {
  return {
    status: "idle",
    mode: null,
    source: null,
    pausedReason: null,
    startedAt: null,
    activeSeconds: 0,
    topicId: null,
    materialId: null,
    todaySeconds: 0,
    goalMinutes: 60,
    bySource: { cards: 0, practice: 0, reading: 0, manual: 0 },
    ...overrides,
  };
}

/** An in-memory `window.mind` that behaves like the real core for the channels the UI uses. */
export function installFakeMind(initial: Partial<FakeState> = {}) {
  // Study screens remember their filter in localStorage; every test starts without one.
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("mind.filter.")) window.localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(initial.rememberedFilters ?? {})) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Not available in this environment.
  }
  const state: FakeState = {
    workspaces: [],
    route: null,
    summary: { materials: 0, cards: 0, questions: 0 },
    nextId: 1,
    materials: [],
    chunks: [],
    runs: [],
    items: [],
    estimateUsd: 0.0123,
    studyQueue: [],
    reviewedToday: 0,
    undoStack: [],
    questions: [],
    answerKeys: {},
    answeredToday: 0,
    errorEntries: [],
    topicList: [],
    overview: emptyOverview(),
    madeCards: [],
    chat: [],
    chatReply: null,
    embeddings: { modelReady: false, enabled: false, indexed: 0, total: 3, model: "m", job: null },
    embeddingsFailure: null,
    exportPath: null,
    importName: null,
    backupFailure: null,
    importResult: { materials: [], errors: [] },
    searchHits: [],
    reader: {
      info: {
        title: "apostila",
        pageCount: 3,
        pages: [
          { width: 595, height: 842 },
          { width: 595, height: 842 },
          { width: 595, height: 842 },
        ],
        lastPage: null,
      },
      lines: {},
      hits: [],
      cited: [],
      saved: [],
      failure: null,
    },
    opened: [],
    practiceRetry: 0,
    update: { enabled: true, current: "0.2.0", available: null, checkedAt: null },
    updateFound: null,
    updateFails: false,
    openFailure: null,
    time: idleTime(),
    timeSettings: { dailyGoalMin: 60, idleSeconds: 120, autoEnabled: true },
    timeStats: {
      totalSeconds: 0,
      avgPerDaySeconds: 0,
      bestDay: null,
      byDay: [],
      byTopic: [],
      byMaterial: [],
    },
    timeSessions: [],
    provider: {
      apiKey: "sk-or-already",
      keySource: "stored",
      consentGiven: true,
      generationModel: "a/gen",
      judgeModel: "b/judge",
      monthlyLimitUsd: 5,
      spentThisMonth: 0,
      knownModels: ["a/gen", "b/judge"],
      lines: [],
      refreshWorks: true,
    },
    ...initial,
  };
  const failure = (code: ErrorInfo["code"], message: string, field?: string): Result<never> => ({
    ok: false,
    error: { code, message, ...(field ? { fields: [{ field, message }] } : {}) },
  });

  const invoke = vi.fn(async (channel: ChannelName, payload: unknown): Promise<Result<unknown>> => {
    switch (channel) {
      case "window:getState":
        return ok({ route: state.route, contractVersion: 1 });
      case "window:setLastRoute":
        state.route = (payload as InputOf<"window:setLastRoute">).route;
        return ok({});
      case "workspace:list":
        return ok({ workspaces: [...state.workspaces] });
      case "workspace:create": {
        const { name } = payload as InputOf<"workspace:create">;
        if (!name.trim()) return failure("VALIDATION_ERROR", "Informe um nome.", "name");
        if (state.workspaces.some((w) => w.name.toLowerCase() === name.trim().toLowerCase())) {
          return failure("VALIDATION_ERROR", "Nome já em uso.", "name");
        }
        const created = {
          id: state.nextId++,
          name: name.trim(),
          createdAt: "2026-01-01T00:00:00.000Z",
        };
        state.workspaces.push(created);
        return ok(created);
      }
      case "workspace:export": {
        if (state.backupFailure) return failure("INTERNAL_ERROR", state.backupFailure);
        return ok({ cancelled: state.exportPath === null, path: state.exportPath });
      }
      case "workspace:import": {
        if (state.backupFailure) return failure("ARCHIVE_INVALID", state.backupFailure);
        if (state.importName === null) return ok({ cancelled: true, workspace: null });
        const created = {
          id: state.nextId++,
          name: state.importName,
          createdAt: "2026-01-01T00:00:00.000Z",
        };
        state.workspaces.push(created);
        return ok({ cancelled: false, workspace: created });
      }
      case "workspace:rename": {
        const { id, name } = payload as InputOf<"workspace:rename">;
        const found = state.workspaces.find((w) => w.id === id);
        if (!found) return failure("WORKSPACE_NOT_FOUND", "Workspace não encontrado.");
        if (
          state.workspaces.some(
            (w) => w.id !== id && w.name.toLowerCase() === name.trim().toLowerCase(),
          )
        ) {
          return failure("VALIDATION_ERROR", "Nome já em uso.", "name");
        }
        found.name = name.trim();
        return ok({ ...found });
      }
      case "workspace:delete": {
        const { id } = payload as InputOf<"workspace:delete">;
        state.workspaces = state.workspaces.filter((w) => w.id !== id);
        return ok({});
      }
      case "material:list":
        return ok({ materials: [...state.materials] });
      case "material:import":
        state.materials = [...state.importResult.materials, ...state.materials];
        return ok(state.importResult);
      case "material:importUrl": {
        const { url } = payload as InputOf<"material:importUrl">;
        if (!/^https?:\/\//.test(url)) {
          return failure(
            "VALIDATION_ERROR",
            "Use um endereço que comece com http:// ou https://.",
            "url",
          );
        }
        const created = state.importResult.materials[0];
        if (!created) return failure("INTERNAL_ERROR", "unscripted");
        state.materials = [created, ...state.materials];
        return ok(created);
      }
      case "material:rename": {
        const { id, title } = payload as InputOf<"material:rename">;
        const found = state.materials.find((entry) => entry.id === id);
        const clean = title.split(/\s+/).filter(Boolean).join(" ");
        if (!found) return failure("MATERIAL_NOT_FOUND", "Material não encontrado.");
        if (!clean)
          return failure("VALIDATION_ERROR", "O nome do material não pode ser vazio.", "title");
        found.title = clean;
        return ok(found);
      }
      case "material:delete": {
        const { id } = payload as InputOf<"material:delete">;
        state.materials = state.materials.filter((m) => m.id !== id);
        return ok({});
      }
      case "material:chunks": {
        const input = payload as InputOf<"material:chunks">;
        const found = state.materials.find((m) => m.id === input.materialId);
        if (!found) return failure("MATERIAL_NOT_FOUND", "Material não encontrado.");
        const size = input.limit ?? 20;
        const start = input.offset ?? 0;
        const total = state.chunks.length;
        return ok({
          material: found,
          chunks: state.chunks.slice(start, start + size),
          total,
          offset: start,
          previousOffset: start > 0 ? Math.max(start - size, 0) : null,
          nextOffset: start + size < total ? start + size : null,
        });
      }
      case "material:search":
        return ok({ hits: state.searchHits });
      case "generation:estimate": {
        const input = payload as InputOf<"generation:estimate">;
        if (input.quantity > 60) {
          return failure("VALIDATION_ERROR", "Peça de 1 a 60 cards.", "quantity");
        }
        return ok({ estimatedUsd: state.estimateUsd, chunks: 3, batches: 1, promptChars: 4000 });
      }
      case "generation:start": {
        const input = payload as InputOf<"generation:start">;
        if (state.generationError) {
          return failure(
            "VALIDATION_ERROR",
            state.generationError.message,
            state.generationError.field,
          );
        }
        if (input.quantity > 60) {
          return failure("VALIDATION_ERROR", "Peça de 1 a 60 cards.", "quantity");
        }
        if (input.variations && state.items.every((entry) => entry.status !== "approved")) {
          return failure("VALIDATION_ERROR", "Pedido de geração inválido.", "variations");
        }
        const run: FakeRun = {
          id: state.runs.length + 1,
          kind: "card",
          subtype: input.subtype,
          materialId: input.topicId === undefined ? (input.materialId ?? null) : null,
          pageFrom: input.pageFrom ?? null,
          pageTo: input.pageTo ?? null,
          topicId: input.topicId ?? null,
          model: "a/gen",
          requested: input.quantity,
          generated: 0,
          discardedNoSource: 0,
          discardedInvalid: 0,
          discardedDuplicate: 0,
          discardedUnsupported: 0,
          approved: 0,
          approvedUnedited: 0,
          discardedReview: 0,
          costUsd: 0,
          status: "queued",
          discardLog: [],
          errorCode: null,
          errorDetail: null,
          jobId: 1,
          createdAt: "2026-03-01T10:00:00.000Z",
          finishedAt: null,
          progress: 0,
        };
        state.runs = [run, ...state.runs];
        return ok(withPending(state, run));
      }
      case "generation:cancel": {
        const { runId } = payload as InputOf<"generation:cancel">;
        state.runs = state.runs.map((r) =>
          r.id === runId ? { ...r, status: "cancelled", progress: null } : r,
        );
        return ok({ cancelled: true });
      }
      case "generation:list":
        return ok({ runs: state.runs.map((r) => withPending(state, r)) });
      case "generation:get": {
        const found = state.runs.find((r) => r.id === (payload as InputOf<"generation:get">).runId);
        return found
          ? ok(withPending(state, found))
          : failure("RUN_NOT_FOUND", "Geração não encontrada.");
      }
      case "review:list": {
        const input = payload as InputOf<"review:list">;
        const run = state.runs.find((r) => r.id === input.runId);
        if (!run) return failure("RUN_NOT_FOUND", "Geração não encontrada.");
        const forRun = state.items.filter((i) => i.runId === input.runId);
        const count = (status: string) => forRun.filter((i) => i.status === status).length;
        return ok({
          run: withPending(state, run),
          items: forRun.filter((i) => !input.status || i.status === input.status),
          counts: {
            draft: count("draft"),
            approved: count("approved"),
            discarded: count("discarded"),
          },
        });
      }
      case "review:get": {
        const found = state.items.find((i) => i.id === (payload as InputOf<"review:get">).itemId);
        return found
          ? ok({ item: found, sourceText: "Trecho completo." })
          : failure("ITEM_NOT_FOUND", "Item não encontrado.");
      }
      case "review:approve":
      case "review:discard": {
        const { ids } = payload as InputOf<"review:approve">;
        const status = channel === "review:approve" ? "approved" : "discarded";
        state.items = state.items.map((i) =>
          ids.includes(i.id) && i.status === "draft" ? { ...i, status } : i,
        );
        return ok({
          approved: status === "approved" ? ids.length : 0,
          discarded: status === "discarded" ? ids.length : 0,
          skipped: 0,
        });
      }
      case "review:discardApproved": {
        const { itemId } = payload as InputOf<"review:discardApproved">;
        const found = state.items.find((i) => i.id === itemId);
        if (!found) return failure("ITEM_NOT_FOUND", "Item não encontrado.");
        if (found.status !== "approved") return ok({ discarded: false });
        state.items = state.items.map((i) => (i.id === itemId ? { ...i, status: "discarded" } : i));
        state.studyQueue = state.studyQueue.filter((c) => c.itemId !== itemId);
        state.questions = state.questions.filter((q) => q.item.id !== itemId);
        return ok({ discarded: true });
      }
      case "items:list":
        return ok({ items: [...(state.catalog ?? [])] });
      case "items:create": {
        const input = payload as InputOf<"items:create">;
        const { draft } = input;
        const text = draft.kind === "card" ? draft.front : draft.statement;
        const textField = draft.kind === "card" ? "front" : "statement";
        if (!text.trim()) {
          return failure(
            "VALIDATION_ERROR",
            draft.kind === "card"
              ? "A frente do card não pode ficar vazia."
              : "O enunciado da questão não pode ficar vazio.",
            textField,
          );
        }
        if (draft.kind === "card" && !draft.back.trim()) {
          return failure("VALIDATION_ERROR", "O verso do card não pode ficar vazio.", "back");
        }
        if (draft.kind === "question") {
          if (!draft.explanation.trim()) {
            return failure("VALIDATION_ERROR", "A explicação não pode ficar vazia.", "explanation");
          }
          const blank = draft.options.findIndex((o) => !o.why.trim());
          if (blank >= 0) {
            return failure(
              "VALIDATION_ERROR",
              "Informe o motivo desta alternativa.",
              `options.${blank}.why`,
            );
          }
        }
        const itemId = state.nextId++;
        const name = input.topic?.trim() || null;
        const owner = input.source
          ? state.materials.find((m) => m.id === input.source?.materialId)
          : undefined;
        const linked = input.source
          ? state.chunks.some(
              (c) =>
                c.materialId === input.source?.materialId &&
                c.text.includes(input.source.quote.trim()),
            )
          : false;
        state.catalog = [
          ...(state.catalog ?? []),
          {
            id: itemId,
            kind: draft.kind,
            subtype: draft.subtype,
            front: text.trim(),
            back: draft.kind === "card" ? draft.back.trim() : draft.explanation.trim(),
            status: "approved",
            topicId: name === null ? null : 99,
            topic: name,
            materialId: null,
            material: null,
            edited: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            origin: input.origin,
            sourceTitle: owner?.title ?? "",
            sourcePage: input.source?.page ?? null,
            hasPdf: linked && owner?.kind === "pdf",
          },
        ];
        return ok({ itemId, topicCreated: name !== null, sourceLinked: linked });
      }
      case "import:template": {
        const input = payload as InputOf<"import:template">;
        if (state.cancelTemplate) return ok({ saved: false });
        (state.templates ??= []).push({ kind: input.kind, format: input.format });
        return ok({ saved: true });
      }
      case "import:preview": {
        await state.importFile?.gate;
        if (state.importFile?.cancel) return ok({ cancelled: true });
        const failed = state.importFile?.error;
        if (failed) return failure(failed.code, failed.message);
        const rows = state.importFile?.rows ?? [];
        const count = (status: string) => rows.filter((row) => row.status === status).length;
        return ok({
          cancelled: false,
          token: "tok-1",
          fileName: state.importFile?.fileName ?? "cartoes.csv",
          totals: {
            rows: rows.length,
            valid: count("valid"),
            errors: count("error"),
            duplicates: count("duplicate"),
          },
          newTopics: state.importFile?.newTopics ?? [],
          rows: rows.slice(0, 500),
          truncated: rows.length > 500,
        });
      }
      case "import:previewRows": {
        const input = payload as InputOf<"import:previewRows">;
        const all = (state.importFile?.rows ?? []).filter(
          (row) => input.status === "all" || row.status === input.status,
        );
        return ok({ rows: all.slice(input.offset, input.offset + input.limit), total: all.length });
      }
      case "import:commit": {
        const input = payload as InputOf<"import:commit">;
        await state.commitGate;
        if (state.commitError) return failure(state.commitError.code, state.commitError.message);
        (state.commits ??= []).push({
          token: input.token,
          includeDuplicates: [...input.includeDuplicates],
        });
        const rows = state.importFile?.rows ?? [];
        const included = rows.filter(
          (row) =>
            row.status === "valid" ||
            (row.status === "duplicate" && input.includeDuplicates.includes(row.line)),
        );
        const topics = new Set(included.filter((row) => row.topicIsNew).map((row) => row.topic));
        return ok({
          imported: included.length,
          skippedDuplicates:
            rows.filter((row) => row.status === "duplicate").length -
            included.filter((row) => row.status === "duplicate").length,
          skippedErrors: rows.filter((row) => row.status === "error").length,
          topicsCreated: topics.size,
        });
      }
      case "import:discard": {
        (state.discarded ??= []).push((payload as InputOf<"import:discard">).token);
        return ok({});
      }
      case "selection:estimate": {
        const input = payload as InputOf<"selection:estimate">;
        return ok({ estimatedUsd: state.estimateUsd, chars: input.text.length });
      }
      case "selection:generate": {
        const input = payload as InputOf<"selection:generate">;
        await state.selection?.gate;
        const failed = state.selection?.error;
        if (failed) return failure(failed.code, failed.message);
        const quote = input.text.trim().slice(0, 30);
        const count = input.quantity ?? 2;
        const drafts =
          state.selection?.drafts ??
          Array.from({ length: count }, (_, index) => ({
            draft:
              input.kind === "card"
                ? ({
                    kind: "card",
                    subtype: "qa",
                    front: `Pergunta ${index + 1} sobre ${input.subject ?? "o trecho"}?`,
                    back: `Resposta ${index + 1}.`,
                  } as const)
                : ({
                    kind: "question",
                    subtype: "certo_errado",
                    statement: `Afirmação ${index + 1} sobre ${input.subject ?? "o trecho"}.`,
                    options: [],
                    answer: "C",
                    explanation: `Porque ${index + 1}.`,
                  } as const),
            topic: input.subject ?? "Tópico",
            quote,
          }));
        return ok({
          drafts,
          discarded: state.selection?.discarded ?? { noSource: 0, invalid: 0, duplicate: 0 },
          costUsd: 0.002,
        });
      }
      case "assist:improve": {
        const input = payload as InputOf<"assist:improve">;
        await state.assist?.gate;
        const failed = state.assist?.error;
        if (failed) return failure(failed.code, failed.message, failed.field);
        if (state.assist?.proposal) return ok({ proposal: state.assist.proposal, costUsd: 0.001 });
        const { draft } = input;
        return ok({
          proposal:
            draft.kind === "card"
              ? { ...draft, front: `${draft.front} (revisado)` }
              : { ...draft, statement: `${draft.statement} (revisado)` },
          costUsd: 0.001,
        });
      }
      case "source:resolve": {
        const input = payload as InputOf<"source:resolve">;
        const found = state.materials.find((m) => m.id === input.materialId);
        if (!found) return failure("MATERIAL_NOT_FOUND", "Material não encontrado.");
        const hit = state.chunks.find(
          (c) => c.materialId === input.materialId && c.text.includes(input.text.trim()),
        );
        return ok({
          match: hit ? "full" : "none",
          chunkId: hit?.id ?? null,
          quote: input.text.trim(),
          materialTitle: found.title,
        });
      }
      case "items:bulk": {
        const input = payload as InputOf<"items:bulk">;
        const fits = (status: string): boolean =>
          input.action === "topic" ||
          (input.action === "approve" && status === "draft") ||
          (input.action === "restore" && status === "discarded") ||
          (input.action === "discard" && status !== "discarded");
        let changed = 0;
        state.catalog = (state.catalog ?? []).map((entry) => {
          if (!input.ids.includes(entry.id) || !fits(entry.status)) return entry;
          changed += 1;
          if (input.action === "topic") {
            const name = input.topic?.trim() || null;
            return { ...entry, topic: name, topicId: name === null ? null : 99 };
          }
          const status = { approve: "approved", discard: "discarded", restore: "approved" }[
            input.action
          ];
          return { ...entry, status };
        });
        return ok({ changed, skipped: input.ids.length - changed });
      }
      case "review:restore": {
        const { itemId } = payload as InputOf<"review:restore">;
        const found = state.items.find((i) => i.id === itemId);
        if (!found) return failure("ITEM_NOT_FOUND", "Item não encontrado.");
        if (found.status !== "discarded") return ok({ status: null });
        const status = found.approvedAt === null ? "draft" : "approved";
        state.items = state.items.map((i) => (i.id === itemId ? { ...i, status } : i));
        return ok({ status });
      }
      case "review:approveAll": {
        const { runId } = payload as InputOf<"review:approveAll">;
        let approved = 0;
        state.items = state.items.map((i) => {
          if (i.runId === runId && i.status === "draft") {
            approved += 1;
            return { ...i, status: "approved" };
          }
          return i;
        });
        return ok({ approved, discarded: 0, skipped: 0 });
      }
      case "review:edit": {
        const input = payload as InputOf<"review:edit">;
        if (!input.front.trim())
          return failure("VALIDATION_ERROR", "A frente do card não pode ficar vazia.", "front");
        let edited: FakeItem | undefined;
        state.items = state.items.map((i) => {
          if (i.id !== input.itemId) return i;
          edited = {
            ...i,
            front: input.front.trim(),
            back: input.back.trim(),
            topic: input.topic,
            ...(input.options !== undefined ? { options: input.options } : {}),
            ...(input.answer !== undefined ? { answer: input.answer } : {}),
            edited: true,
          };
          return edited;
        });
        return edited ? ok(edited) : failure("ITEM_NOT_FOUND", "Item não encontrado.");
      }
      case "study:today":
        return ok({
          counts: studyCounts(state),
          settings: state.studySettings ?? DEFAULT_STUDY_SETTINGS,
          defaults: DEFAULT_STUDY_SETTINGS,
          facets: {
            topics: state.facetTopics ?? [
              { key: 1, label: "Biologia", count: state.studyQueue.length },
            ],
            materials: [{ key: 1, label: "apostila", count: state.studyQueue.length }],
            subtypes: [{ key: "qa", label: "qa", count: state.studyQueue.length }],
            cards: state.studyQueue.length,
            questions: state.questions.length,
          },
        });
      case "practice:facets":
        return ok({
          topics: state.facetTopics ?? [
            { key: 1, label: "Biologia", count: state.questions.length },
          ],
          materials: [{ key: 1, label: "apostila", count: state.questions.length }],
          subtypes: [...new Set(state.questions.map((q) => q.item.subtype))].map((key) => ({
            key,
            label: key,
            count: state.questions.filter((q) => q.item.subtype === key).length,
          })),
          cards: state.studyQueue.length,
          questions: state.questions.length,
        });
      case "study:next": {
        const { extraNew, early } = payload as InputOf<"study:next">;
        const held = state.studyHeldBack ?? [];
        const already = state.releasedExtra ?? 0;
        if ((extraNew ?? 0) > already && held.length > 0) {
          state.studyQueue = [...state.studyQueue, ...held.splice(0, (extraNew ?? 0) - already)];
          state.releasedExtra = extraNew ?? 0;
        }
        if (state.waitingCards && state.studyQueue.length === 0) {
          if (early) {
            state.studyQueue = [...state.waitingCards.cards];
            state.waitingCards = undefined;
          } else {
            return ok({
              card: null,
              counts: studyCounts(state),
              waiting: { count: state.waitingCards.cards.length, due: state.waitingCards.due },
            });
          }
        }
        return ok({
          card: state.studyQueue[0] ?? null,
          counts: studyCounts(state),
          waiting: null,
        });
      }
      case "study:rate": {
        const first = state.studyQueue[0];
        if (first) {
          state.undoStack.push(first);
          state.studyQueue = state.studyQueue.slice(1);
          state.reviewedToday += 1;
        }
        return ok({});
      }
      case "study:undo": {
        const last = state.undoStack.pop();
        if (!last) return ok({ itemId: null });
        state.studyQueue = [last, ...state.studyQueue];
        state.reviewedToday = Math.max(state.reviewedToday - 1, 0);
        return ok({ itemId: last.itemId });
      }
      case "study:saveSettings": {
        const input = payload as InputOf<"study:saveSettings">;
        if (input.dailyGoal !== undefined) {
          if (input.dailyGoal < 1 || input.dailyGoal > 2000) {
            return failure("VALIDATION_ERROR", "Meta inválida.", "dailyGoal");
          }
          state.overview.summary.goal = input.dailyGoal;
        }
        const steps = input.learningSteps?.trim().split(/\s+/).filter(Boolean) ?? [];
        if (steps.some((step) => !/^\d+[mhd]$/.test(step))) {
          return failure(
            "VALIDATION_ERROR",
            'Use passos como "1m 10m" (m = minutos, h = horas, d = dias), no máximo 5.',
            "learningSteps",
          );
        }
        state.studySettings = {
          ...(state.studySettings ?? DEFAULT_STUDY_SETTINGS),
          ...Object.fromEntries(
            Object.entries(input).filter(
              ([key, value]) => key !== "workspaceId" && value !== undefined,
            ),
          ),
        };
        return ok(state.studySettings);
      }
      case "practice:settings":
        return ok({
          settings: state.practiceSettings ?? DEFAULT_PRACTICE_SETTINGS,
          defaults: DEFAULT_PRACTICE_SETTINGS,
        });
      case "practice:saveSettings": {
        const input = payload as InputOf<"practice:saveSettings">;
        state.practiceSettings = {
          ...(state.practiceSettings ?? DEFAULT_PRACTICE_SETTINGS),
          ...Object.fromEntries(
            Object.entries(input).filter(
              ([key, value]) => key !== "workspaceId" && value !== undefined,
            ),
          ),
        };
        return ok(state.practiceSettings);
      }
      case "practice:next": {
        const input = payload as InputOf<"practice:next">;
        const question =
          state.questions.find(
            (q) =>
              !(input.exclude ?? []).includes(q.item.id) &&
              (input.filter?.subtype === undefined || q.item.subtype === input.filter.subtype),
          ) ?? null;
        return ok({ question, counts: practiceCounts(state) });
      }
      case "practice:answer": {
        const input = payload as InputOf<"practice:answer">;
        const found = state.questions.find((q) => q.item.id === input.itemId);
        if (!found) return failure("ITEM_NOT_FOUND", "Não existe questão.");
        state.answeredToday += 1;
        const key = state.answerKeys[input.itemId] ?? "A";
        return ok({
          correct: input.answer === key,
          answer: input.answer,
          correctKey: key,
          explanation: "Comentário da questão.",
          options: found.item.options,
          attemptId: state.answeredToday,
        });
      }
      case "practice:counts":
        return ok(practiceCounts(state));
      case "errors:list": {
        const input = payload as InputOf<"errors:list">;
        const entries = state.errorEntries.filter(
          (e) =>
            input.topicId === undefined ||
            state.topicList.find((t) => t.id === input.topicId)?.name === e.topic,
        );
        return ok({
          entries,
          counts: {
            total: state.errorEntries.length,
            fromQuestions: state.errorEntries.filter((e) => e.fromQuestion).length,
            failedCards: state.errorEntries.filter((e) => e.failures > 0).length,
          },
          topics: state.topicList,
        });
      }
      case "errors:makeCard": {
        const input = payload as InputOf<"errors:makeCard">;
        const created = !state.madeCards.includes(input.questionId);
        if (created) state.madeCards.push(input.questionId);
        return ok({ itemId: 1000 + input.questionId, created });
      }
      case "topics:list":
        return ok({ topics: state.topicList });
      case "topics:rename": {
        const input = payload as InputOf<"topics:rename">;
        if (!input.name.trim()) {
          return failure("VALIDATION_ERROR", "Informe um nome.", "name");
        }
        const found = state.topicList.find((t) => t.id === input.topicId);
        if (!found) return failure("TOPIC_NOT_FOUND", "Não existe tópico.");
        found.name = input.name.trim();
        for (const stat of state.overview.topics) {
          if (stat.topicId === input.topicId) stat.name = found.name;
        }
        return ok(found);
      }
      case "topics:merge": {
        const input = payload as InputOf<"topics:merge">;
        const target = state.topicList.find((t) => t.id === input.targetId);
        if (!target) return failure("TOPIC_NOT_FOUND", "Não existe tópico.");
        state.topicList = state.topicList.filter((t) => t.id !== input.sourceId);
        state.overview.topics = state.overview.topics.filter((t) => t.topicId !== input.sourceId);
        return ok(target);
      }
      case "topics:delete": {
        const input = payload as InputOf<"topics:delete">;
        state.topicList = state.topicList.filter((t) => t.id !== input.topicId);
        state.overview.topics = state.overview.topics.filter((t) => t.topicId !== input.topicId);
        return ok({});
      }
      case "stats:materials":
        return ok({ materials: state.materialStats ?? [] });
      case "stats:overview":
        return ok(state.overview);
      case "chat:history":
        return ok({ messages: [...state.chat] });
      case "chat:ask": {
        const input = payload as InputOf<"chat:ask">;
        if (!input.question.trim()) {
          return failure("VALIDATION_ERROR", "Escreva uma pergunta.", "question");
        }
        const made = state.chatReply?.(input.question) ?? {
          answer: `Resposta para ${input.question}`,
          supported: true,
          citations: [
            {
              chunkId: 4,
              materialId: 1,
              materialTitle: "apostila",
              page: 2,
              section: null,
              quote: "trecho citado do material",
            },
          ],
          costUsd: 0.001,
        };
        const reply: FakeReply = {
          id: state.chat.length + 1,
          question: input.question,
          createdAt: "2026-11-14T10:00:00.000Z",
          ...made,
        };
        state.chat.push(reply);
        return ok(reply);
      }
      case "chat:clear": {
        const cleared = state.chat.length;
        state.chat = [];
        return ok({ cleared });
      }
      case "embeddings:status":
        return ok(state.embeddings);
      case "embeddings:enable": {
        if (state.embeddingsFailure) {
          state.embeddings = {
            ...state.embeddings,
            enabled: true,
            job: {
              state: "failed",
              progress: 0,
              message: "",
              errorDetail: state.embeddingsFailure,
            },
          };
          return ok({ jobId: 1 });
        }
        state.embeddings = {
          ...state.embeddings,
          enabled: true,
          modelReady: true,
          indexed: state.embeddings.total,
          job: { state: "done", progress: 1, message: "", errorDetail: null },
        };
        return ok({ jobId: 1 });
      }
      case "embeddings:disable":
        state.embeddings = { ...state.embeddings, enabled: false };
        return ok({});
      case "settings:get": {
        const p = state.provider;
        return ok({
          provider: "openrouter",
          generationModel: p.generationModel,
          judgeModel: p.judgeModel,
          monthlyLimitUsd: p.monthlyLimitUsd,
          keyConfigured: p.apiKey !== null,
          keySource: p.keySource,
          consentGiven: p.consentGiven,
          consentAcceptedAt: p.consentGiven ? "2026-01-01T00:00:00.000Z" : null,
          spentThisMonth: p.spentThisMonth,
          month: "2026-03",
          knownModels: p.knownModels,
        });
      }
      case "settings:save": {
        const input = payload as InputOf<"settings:save">;
        if (input.generationModel !== undefined && /\s|!/.test(input.generationModel)) {
          return failure(
            "VALIDATION_ERROR",
            "Informe o identificador do modelo.",
            "generationModel",
          );
        }
        if (input.apiKey !== undefined) {
          state.provider.apiKey = input.apiKey;
          state.provider.keySource = "stored";
        }
        if (input.generationModel !== undefined)
          state.provider.generationModel = input.generationModel;
        if (input.judgeModel !== undefined) state.provider.judgeModel = input.judgeModel;
        if (input.monthlyLimitUsd !== undefined)
          state.provider.monthlyLimitUsd = input.monthlyLimitUsd;
        return ok({});
      }
      case "settings:clearKey":
        state.provider.apiKey = null;
        state.provider.keySource = null;
        return ok({});
      case "settings:setConsent":
        state.provider.consentGiven = (payload as InputOf<"settings:setConsent">).given;
        return ok({});
      case "settings:testConnection":
        return ok(
          state.provider.connectionError
            ? { ok: false, message: state.provider.connectionError }
            : { ok: true, message: "Conexão com o OpenRouter funcionando." },
        );
      case "settings:refreshModels":
        return ok({ refreshed: state.provider.refreshWorks });
      case "settings:getCost":
        return ok({
          total: state.provider.lines.reduce((sum, line) => sum + line.costUsd, 0),
          lines: state.provider.lines,
        });
      case "time:state":
        return ok(state.time);
      case "time:start": {
        const { topicId } = payload as InputOf<"time:start">;
        state.time = {
          ...state.time,
          status: "running",
          mode: "manual",
          source: "manual",
          startedAt: "2026-01-01T12:00:00.000Z",
          topicId: topicId ?? null,
        };
        return ok(state.time);
      }
      case "time:pause":
        if (state.time.status === "running") {
          state.time = { ...state.time, status: "paused", pausedReason: "manual", startedAt: null };
        }
        return ok(state.time);
      case "time:resume":
        if (state.time.status === "paused") {
          state.time = { ...state.time, status: "running", pausedReason: null };
        }
        return ok(state.time);
      case "reader:info":
        return state.reader.failure
          ? { ok: false, error: state.reader.failure }
          : ok(state.reader.info);
      case "reader:page":
        return state.reader.failure
          ? { ok: false, error: state.reader.failure }
          : ok({ dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 100, height: 140 });
      case "reader:text": {
        const { page } = payload as InputOf<"reader:text">;
        return state.reader.failure
          ? { ok: false, error: state.reader.failure }
          : ok({ width: 595, height: 842, lines: state.reader.lines[page] ?? [] });
      }
      case "reader:search": {
        const { query } = payload as InputOf<"reader:search">;
        const found = state.reader.hits.filter((hit) => hit.rects.length > 0 && query.length > 0);
        return ok({ hits: found, truncated: false });
      }
      case "reader:locate":
        return ok({ rects: state.reader.cited });
      case "reader:savePosition":
        state.reader.saved.push((payload as InputOf<"reader:savePosition">).page);
        return ok({});
      case "update:state":
        return ok(state.update);
      case "update:check": {
        if (state.updateFails) return ok({ outcome: "error", state: state.update, release: null });
        state.update = {
          ...state.update,
          available: state.updateFound,
          checkedAt: "2026-03-01T10:00:00.000Z",
        };
        return ok({
          outcome: state.updateFound ? "available" : "current",
          state: state.update,
          release: state.updateFound,
        });
      }
      case "update:setEnabled":
        state.update = {
          ...state.update,
          enabled: (payload as InputOf<"update:setEnabled">).enabled,
        };
        return ok(state.update);
      case "update:dismiss":
        state.update = { ...state.update, available: null };
        return ok(state.update);
      case "update:openRelease":
        if (!state.update.available)
          return failure("OPEN_FAILED", "Não há uma nova versão para abrir.");
        state.opened.push({ kind: "release", materialId: 0 });
        return ok({});
      case "reader:openWindow": {
        const { materialId, page, quote } = payload as InputOf<"reader:openWindow">;
        if (state.openFailure) return failure("OPEN_FAILED", state.openFailure);
        state.opened.push({
          kind: "window",
          materialId,
          ...(page !== undefined ? { page } : {}),
          ...(quote !== undefined ? { quote } : {}),
        });
        return ok({});
      }
      case "material:openOriginal": {
        const { materialId } = payload as InputOf<"material:openOriginal">;
        if (state.openFailure) return failure("OPEN_FAILED", state.openFailure);
        state.opened.push({ kind: "system", materialId });
        return ok({});
      }
      case "time:getSettings":
        return ok(state.timeSettings);
      case "time:saveSettings": {
        const input = payload as InputOf<"time:saveSettings">;
        if (input.dailyGoalMin !== undefined && input.dailyGoalMin > 600) {
          return failure("VALIDATION_ERROR", "Configuração de tempo inválida.", "dailyGoalMin");
        }
        state.timeSettings = {
          dailyGoalMin: input.dailyGoalMin ?? state.timeSettings.dailyGoalMin,
          idleSeconds: input.idleSeconds ?? state.timeSettings.idleSeconds,
          autoEnabled: input.autoEnabled ?? state.timeSettings.autoEnabled,
        };
        state.time = { ...state.time, goalMinutes: state.timeSettings.dailyGoalMin };
        return ok(state.timeSettings);
      }
      case "time:stats":
        return ok(state.timeStats);
      case "time:sessions":
        return ok({ sessions: state.timeSessions });
      case "time:deleteSession": {
        const { id } = payload as InputOf<"time:deleteSession">;
        state.timeSessions = state.timeSessions.filter((row) => row.id !== id);
        return ok({});
      }
      case "time:activity":
      case "time:blur":
        return ok({});
      case "time:stop":
        state.time = idleTime({
          todaySeconds: state.time.todaySeconds,
          bySource: state.time.bySource,
        });
        return ok(state.time);
      case "today:summary":
        return "code" in state.summary ? { ok: false, error: state.summary } : ok(state.summary);
    }
  });

  const mind = { invoke, on: vi.fn(() => () => undefined) } as unknown as MindApi;
  Object.defineProperty(window, "mind", { value: mind, configurable: true, writable: true });
  Object.defineProperty(globalThis, "__APP_VERSION__", { value: "0.0.0-test", configurable: true });
  return { state, invoke };
}
