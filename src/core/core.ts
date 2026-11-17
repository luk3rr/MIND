/*
 * Filename: core.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { loggedFetch } from "./net-log.js";
import { join } from "node:path";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { MaterialService, extractInProcess } from "./ingestion/service.js";
import type { ExtractFn } from "./ingestion/types.js";
import { Bm25Retriever } from "./retrieval/retriever.js";
import { JobQueue } from "./jobs/queue.js";
import type { JobEvent } from "./jobs/queue.js";
import { ConsentService } from "./llm/consent.js";
import { CostLedger, PriceCatalog } from "./llm/costs.js";
import { GuardedProvider } from "./llm/guarded.js";
import { OpenRouterProvider } from "./llm/openrouter.js";
import type { FetchLike } from "./llm/openrouter.js";
import type { FetchLike as PageFetchLike } from "./ingestion/web.js";
import type { Provider } from "./llm/provider.js";
import { SecretStore } from "./secrets.js";
import { SettingsService } from "./settings/service.js";
import { AppError } from "./contracts/errors.js";
import { GenerationService } from "./generation/service.js";
import { ReviewService } from "./review/service.js";
import type { Worker } from "node:worker_threads";
import { ChatService } from "./chat/service.js";
import { EmbeddingsService } from "./retrieval/embeddings.js";
import type { Embedder } from "./retrieval/embeddings.js";
import { UnavailableEmbedder } from "./retrieval/fake-embedder.js";
import { TransformersEmbedder } from "./retrieval/transformers-embedder.js";
import { AssistService } from "./assist/service.js";
import { SelectionGenerator } from "./generation/selection.js";
import { ImportService } from "./importing/service.js";
import { ItemAuthoringService } from "./authoring/service.js";
import { ErrorNotebook } from "./notebook/service.js";
import { PracticeService } from "./practice/service.js";
import { StatsService } from "./stats/service.js";
import { TopicService } from "./stats/topics.js";
import { StudyService } from "./study/service.js";
import { TimeService } from "./time/service.js";
import { UpdateService } from "./update/service.js";
import type { ReleaseInfo } from "./update/service.js";
import { InProcessReader, WorkerReader } from "./reader/backend.js";
import { PageCache, ReaderService } from "./reader/service.js";
import type { TzOffset } from "./study/scheduler.js";
import { WorkspaceRegistry } from "./workspaces/registry.js";

export interface CoreOptions {
  dataDir: string;
  clock?: Clock;
  maxConcurrentJobs?: number;
  onJobEvent?: (event: JobEvent) => void;
  /** Replaces the OpenRouter client (tests and offline runs). */
  provider?: Provider;
  fetch?: FetchLike;
  env?: Record<string, string | undefined>;
  /** How files are read; the app uses worker threads, tests read in-process. */
  extract?: ExtractFn;
  maxUploadMb?: number;
  generationConcurrency?: number;
  /** Minutes behind UTC of the local clock; tests fix it to get a stable study day. */
  tzOffset?: TzOffset;
  /** Folder for the OCR language data (a cache); OCR is off when absent. */
  tessdataDir?: string;
  /** How web pages are downloaded; defaults to the global fetch. */
  pageFetch?: PageFetchLike;
  /** Replaces the semantic-search model (tests and offline runs). */
  embedder?: Embedder;
  /** Folder of the semantic-search model (a cache); the model is downloaded there on demand. */
  modelsDir?: string;
  /** Creates the worker thread that runs the model (the app passes the bundled worker). */
  createEmbedWorker?: () => Worker;
  /** Creates the worker thread that draws PDF pages (the app passes the bundled worker). */
  createReaderWorker?: () => Worker;
  /** The installed version, used to tell whether a release is newer. */
  appVersion?: string;
  /** Replaces the request that looks for a new release (tests). */
  updateFetch?: FetchLike;
  /** Replaces the address of the release lookup (development and end-to-end runs only). */
  updateUrl?: string;
  /** Called when a newer release is found. */
  onUpdateAvailable?: (release: ReleaseInfo) => void;
  /** Called with the workspace id whenever its study timer changes. */
  onTimeEvent?: (event: { workspaceId: number }) => void;
}

/** Everything the provider layer needs; the guarded provider is the only door to a model. */
export interface Llm {
  secrets: SecretStore;
  settings: SettingsService;
  consent: ConsentService;
  catalog: PriceCatalog;
  ledger: CostLedger;
  provider: Provider;
  fetch: FetchLike;
  /** Throws a stable error when a model call would be refused (key, consent or limit). */
  ensureReady(): void;
}

/** Everything the application needs, built from a data directory. It never imports Electron. */
export interface Core {
  registry: WorkspaceRegistry;
  /** Looks for a newer release of the app. */
  updates: UpdateService;
  queue: JobQueue;
  llm: Llm;
  /** Asks the model to polish the text of an item the person wrote; never stores anything. */
  assist: AssistService;
  materials(workspaceId: number): MaterialService;
  generation(workspaceId: number): GenerationService;
  review(workspaceId: number): ReviewService;
  /** Spreadsheet templates and imports of items. */
  importing: ImportService;
  /** Writes drafts from a passage selected in the reader (stores nothing). */
  selection(workspaceId: number): SelectionGenerator;
  /** Creates items by hand (not from a generation). */
  authoring(workspaceId: number): ItemAuthoringService;
  study(workspaceId: number): StudyService;
  /** The study timer of a workspace; one instance per workspace for the life of the core. */
  time(workspaceId: number): TimeService;
  /** Opens the original PDF of a material of the workspace. */
  reader(workspaceId: number): ReaderService;
  /** Closes and forgets the timer of a workspace (before it is deleted). */
  releaseTime(workspaceId: number): void;
  practice(workspaceId: number): PracticeService;
  notebook(workspaceId: number): ErrorNotebook;
  stats(workspaceId: number): StatsService;
  topics(workspaceId: number): TopicService;
  retriever(workspaceId: number): Bm25Retriever;
  chat(workspaceId: number): ChatService;
  embeddings(workspaceId: number): EmbeddingsService;
  close(): Promise<void>;
}

export function createCore(options: CoreOptions): Core {
  const clock = options.clock ?? systemClock;
  const registry = new WorkspaceRegistry(options.dataDir, clock);
  const queue = new JobQueue({
    maxConcurrent: options.maxConcurrentJobs ?? 2,
    clock,
    ...(options.onJobEvent ? { onEvent: options.onJobEvent } : {}),
  });
  const app = registry.appDatabase;
  const secrets = new SecretStore(join(options.dataDir, "ai"), options.env);
  const settings = new SettingsService(app, secrets);
  const consent = new ConsentService(app, clock);
  const catalog = new PriceCatalog(app, clock);
  const ledger = new CostLedger(app, catalog, clock);
  const embedder: Embedder =
    options.embedder ??
    (options.createEmbedWorker && options.modelsDir
      ? new TransformersEmbedder(options.modelsDir, options.createEmbedWorker)
      : new UnavailableEmbedder());
  const fetchImpl: FetchLike = loggedFetch(options.fetch ?? ((url, init) => fetch(url, init)), {
    withPath: true,
  });
  const inner = options.provider ?? new OpenRouterProvider(secrets, { fetch: fetchImpl });
  const provider = new GuardedProvider(inner, consent, ledger, settings, clock);
  const ensureReady = (): void => {
    if (provider.requiresConsent) {
      if (!secrets.isConfigured()) {
        throw new AppError(
          "PROVIDER_KEY_MISSING",
          "Configure a chave do OpenRouter em Configurações.",
        );
      }
      if (!consent.isGiven(provider.name)) {
        throw new AppError(
          "CONSENT_REQUIRED",
          "Aceite o envio de trechos ao provedor em Configurações.",
        );
      }
    }
    const limit = settings.get().monthlyLimitUsd;
    const spent = ledger.spentThisMonth();
    if (spent >= limit) {
      const now = clock.now();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      throw new AppError(
        "MONTHLY_LIMIT_REACHED",
        `Gasto de US$ ${spent.toFixed(2)} de US$ ${limit.toFixed(2)} em ${now.getUTCFullYear()}-${month}.`,
      );
    }
  };
  const llm: Llm = {
    secrets,
    settings,
    consent,
    catalog,
    ledger,
    provider,
    fetch: fetchImpl,
    ensureReady,
  };
  const updates = new UpdateService(app, {
    currentVersion: options.appVersion ?? "0.0.0",
    fetch: loggedFetch(options.updateFetch ?? ((url, init) => fetch(url, init)), {
      withPath: true,
    }),
    clock,
    ...(options.updateUrl ? { apiUrl: options.updateUrl } : {}),
    ...(options.onUpdateAvailable ? { onAvailable: options.onUpdateAvailable } : {}),
  });
  const timers = new Map<number, TimeService>();
  const readerBackend = options.createReaderWorker
    ? new WorkerReader(options.createReaderWorker)
    : new InProcessReader();
  const pageCache = new PageCache();
  return {
    registry,
    updates,
    queue,
    llm,
    assist: new AssistService(llm),
    time: (workspaceId) => {
      const cached = timers.get(workspaceId);
      if (cached) return cached;
      const created = new TimeService(registry.open(workspaceId), {
        clock,
        ...(options.tzOffset ? { offset: options.tzOffset } : {}),
        onChange: () => options.onTimeEvent?.({ workspaceId }),
      });
      timers.set(workspaceId, created);
      return created;
    },
    reader: (workspaceId) =>
      new ReaderService(registry.open(workspaceId), readerBackend, pageCache),
    releaseTime: (workspaceId) => {
      timers.get(workspaceId)?.shutdown();
      timers.delete(workspaceId);
    },
    generation: (workspaceId) =>
      new GenerationService(registry.open(workspaceId), queue, llm, options.generationConcurrency),
    review: (workspaceId) => new ReviewService(registry.open(workspaceId), clock),
    importing: new ImportService(registry, clock),
    selection: (workspaceId) => new SelectionGenerator(registry.open(workspaceId), llm),
    authoring: (workspaceId) => new ItemAuthoringService(registry.open(workspaceId), clock),
    notebook: (workspaceId) => new ErrorNotebook(registry.open(workspaceId), clock),
    stats: (workspaceId) =>
      new StatsService(registry.open(workspaceId), {
        clock,
        ...(options.tzOffset ? { offset: options.tzOffset } : {}),
      }),
    topics: (workspaceId) => new TopicService(registry.open(workspaceId)),
    practice: (workspaceId) =>
      new PracticeService(registry.open(workspaceId), {
        clock,
        ...(options.tzOffset ? { offset: options.tzOffset } : {}),
      }),
    study: (workspaceId) =>
      new StudyService(registry.open(workspaceId), {
        clock,
        ...(options.tzOffset ? { offset: options.tzOffset } : {}),
      }),
    materials: (workspaceId) =>
      new MaterialService(registry.open(workspaceId), queue, {
        maxUploadBytes: (options.maxUploadMb ?? 200) * 1024 * 1024,
        extract: options.extract ?? extractInProcess,
        ...(options.tessdataDir ? { tessdataDir: options.tessdataDir } : {}),
        fetch: loggedFetch(options.pageFetch ?? ((url, init) => fetch(url, init)), {
          withPath: false,
        }),
      }),
    retriever: (workspaceId) => new Bm25Retriever(registry.open(workspaceId).connection),
    embeddings: (workspaceId) => {
      const workspace = registry.open(workspaceId);
      return new EmbeddingsService(workspace.info.id, workspace.connection, queue, embedder);
    },
    chat: (workspaceId) => {
      const workspace = registry.open(workspaceId);
      const embeddings = new EmbeddingsService(
        workspace.info.id,
        workspace.connection,
        queue,
        embedder,
      );
      return new ChatService(
        workspace,
        llm,
        embeddings.retriever(new Bm25Retriever(workspace.connection)),
        clock,
      );
    },
    async close() {
      for (const timer of timers.values()) timer.shutdown();
      timers.clear();
      await readerBackend.close();
      await queue.shutdown();
      if (embedder instanceof TransformersEmbedder) embedder.close();
      registry.close();
    },
  };
}
