/*
 * Filename: core.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

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
import { PracticeService } from "./practice/service.js";
import { StudyService } from "./study/service.js";
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
  queue: JobQueue;
  llm: Llm;
  materials(workspaceId: number): MaterialService;
  generation(workspaceId: number): GenerationService;
  review(workspaceId: number): ReviewService;
  study(workspaceId: number): StudyService;
  practice(workspaceId: number): PracticeService;
  retriever(workspaceId: number): Bm25Retriever;
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
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
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
  return {
    registry,
    queue,
    llm,
    generation: (workspaceId) =>
      new GenerationService(registry.open(workspaceId), queue, llm, options.generationConcurrency),
    review: (workspaceId) => new ReviewService(registry.open(workspaceId), clock),
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
        ...(options.pageFetch ? { fetch: options.pageFetch } : {}),
      }),
    retriever: (workspaceId) => new Bm25Retriever(registry.open(workspaceId).connection),
    async close() {
      await queue.shutdown();
      registry.close();
    },
  };
}
