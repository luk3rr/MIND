/*
 * Filename: handlers.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { logger } from "../../core/logging.js";

const log = logger("settings");
import { CONTRACT_VERSION } from "../../core/contracts/index.js";
import type { OutputOf } from "../../core/contracts/index.js";
import type { Core } from "../../core/core.js";
import { todaySummary } from "../../core/today/summary.js";
import { cardSides } from "../../core/study/rendering.js";
import { Rating } from "../../core/study/scheduler.js";
import { downloadName, exportWorkspace, importWorkspace } from "../../core/workspaces/archive.js";
import { testConnection } from "../../core/llm/connection.js";
import type { Handlers } from "./router.js";
import { AppError } from "../../core/contracts/errors.js";
import { basename } from "node:path";

/** The last route is a tiny piece of window state kept outside the databases. */
export interface RouteStore {
  lastRoute: string | null;
}

/** The settings the window may see: never the key itself, only whether one is configured. */
function settingsView(core: Core): OutputOf<"settings:get"> {
  const settings = core.llm.settings.get();
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    ...settings,
    keyConfigured: core.llm.secrets.isConfigured(),
    keySource: core.llm.secrets.source(),
    consentGiven: core.llm.consent.isGiven(settings.provider),
    consentAcceptedAt: core.llm.consent.givenAt(settings.provider),
    spentThisMonth: core.llm.ledger.monthTotal(now.getUTCFullYear(), now.getUTCMonth() + 1),
    month,
    knownModels: core.llm.catalog.knownModels(),
  };
}

/** Wires every IPC channel to the core; it never imports Electron, so it is testable. */
export interface UiBridge {
  /** Opens the native file dialog and returns the chosen paths (empty when cancelled). */
  pickFiles(): Promise<string[]>;
  /** Opens the native "save as" dialog; null when cancelled. */
  pickSavePath?(defaultName: string): Promise<string | null>;
  /** Opens the native dialog for a backup `.zip`; null when cancelled. */
  pickBackup?(): Promise<string | null>;
  /** Opens (or focuses) the separate reader window of a PDF. */
  openReaderWindow?(target: { workspaceId: number; materialId: number; page?: number }): void;
  /** Opens a file in the system's default application; returns an error text, empty on success. */
  openPath?(path: string): Promise<string>;
  appVersion?: string;
}

const PREVIEW_PAGE_SIZE = 20;

export function createHandlers(core: Core, routes: RouteStore, ui: UiBridge): Handlers {
  return {
    "window:getState": () => ({ route: routes.lastRoute, contractVersion: CONTRACT_VERSION }),
    "window:setLastRoute": ({ route }) => {
      routes.lastRoute = route;
      return {};
    },
    "workspace:list": () => ({ workspaces: core.registry.list() }),
    "workspace:create": ({ name }) => core.registry.create(name),
    "workspace:export": async ({ id }) => {
      const info = core.registry.get(id);
      const path = (await ui.pickSavePath?.(downloadName(info))) ?? null;
      if (path === null) return { cancelled: true, path: null };
      await exportWorkspace(core.registry, id, path, {
        ...(ui.appVersion ? { appVersion: ui.appVersion } : {}),
      });
      return { cancelled: false, path };
    },
    "workspace:import": async () => {
      const path = (await ui.pickBackup?.()) ?? null;
      if (path === null) return { cancelled: true, workspace: null };
      return { cancelled: false, workspace: await importWorkspace(core.registry, path) };
    },
    "workspace:rename": ({ id, name }) => core.registry.rename(id, name),
    "today:summary": ({ workspaceId }) => todaySummary(core.registry.open(workspaceId)),
    "material:list": ({ workspaceId }) => ({ materials: core.materials(workspaceId).listViews() }),
    "material:import": async ({ workspaceId }) => {
      const service = core.materials(workspaceId);
      const materials = [];
      const errors = [];
      for (const path of await ui.pickFiles()) {
        try {
          materials.push(service.view(service.importFile(path)));
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          errors.push({ file: basename(path), message: error.message });
        }
      }
      return { materials, errors };
    },
    "material:importUrl": ({ workspaceId, url }) => {
      const service = core.materials(workspaceId);
      return service.view(service.importUrl(url));
    },
    "material:rename": ({ workspaceId, id, title }) => {
      const service = core.materials(workspaceId);
      return service.view(service.rename(id, title));
    },
    "material:delete": ({ workspaceId, id }) => {
      core.materials(workspaceId).delete(id);
      return {};
    },
    "material:chunks": ({ workspaceId, materialId, offset, limit, chunkId }) => {
      const service = core.materials(workspaceId);
      const size = limit ?? PREVIEW_PAGE_SIZE;
      let start = Math.max(offset ?? 0, 0);
      if (chunkId !== undefined) {
        const before = service.chunkOffset(materialId, chunkId);
        if (before !== null) start = before - (before % size);
      }
      const total = service.chunkCount(materialId);
      return {
        material: service.view(service.get(materialId)),
        chunks: service.chunks(materialId, { offset: start, limit: size }),
        total,
        offset: start,
        previousOffset: start > 0 ? Math.max(start - size, 0) : null,
        nextOffset: start + size < total ? start + size : null,
      };
    },
    "material:search": ({ workspaceId, query, limit }) => ({
      hits: core.retriever(workspaceId).search(query, { limit: limit ?? 20 }),
    }),
    "generation:estimate": ({ workspaceId, ...request }) =>
      core.generation(workspaceId).estimate(request),
    "generation:start": ({ workspaceId, ...request }) => {
      const service = core.generation(workspaceId);
      return service.view(service.start(request));
    },
    "generation:cancel": ({ workspaceId, runId }) => ({
      cancelled: core.generation(workspaceId).cancel(runId),
    }),
    "generation:list": ({ workspaceId }) => {
      const service = core.generation(workspaceId);
      return { runs: service.listRuns().map((run) => service.view(run)) };
    },
    "generation:get": ({ workspaceId, runId }) => {
      const service = core.generation(workspaceId);
      return service.view(service.get(runId));
    },
    "review:list": ({ workspaceId, runId, status }) => {
      const review = core.review(workspaceId);
      const generation = core.generation(workspaceId);
      return {
        run: generation.view(generation.get(runId)),
        items: review.list({ runId, ...(status ? { status } : {}) }),
        counts: {
          draft: review.count({ runId, status: "draft" }),
          approved: review.count({ runId, status: "approved" }),
          discarded: review.count({ runId, status: "discarded" }),
        },
      };
    },
    "review:get": ({ workspaceId, itemId }) => {
      const review = core.review(workspaceId);
      const found = review.get(itemId);
      return { item: found, sourceText: review.sourceText(found.chunkId) };
    },
    "review:approve": ({ workspaceId, ids }) => core.review(workspaceId).review(ids, []),
    "review:discard": ({ workspaceId, ids }) => core.review(workspaceId).review([], ids),
    "review:approveAll": ({ workspaceId, runId }) => core.review(workspaceId).approveAll(runId),
    "review:edit": ({ workspaceId, itemId, front, back, topic }) =>
      core.review(workspaceId).edit(itemId, front, back, topic),
    "study:today": ({ workspaceId, filter }) => {
      const study = core.study(workspaceId);
      return {
        counts: study.counts(undefined, filter),
        settings: study.settings(),
        facets: study.facets(),
      };
    },
    "study:next": ({ workspaceId, filter }) => {
      const study = core.study(workspaceId);
      const next = study.nextCard(undefined, filter);
      const counts = study.counts(undefined, filter);
      if (!next) return { card: null, counts };
      const sides = cardSides(next.item.subtype, next.item.front, next.item.back);
      const previews = study.previews(next);
      return {
        card: {
          itemId: next.item.id,
          subtype: next.item.subtype,
          topic: next.item.topic,
          sourceTitle: next.item.sourceTitle,
          sourcePage: next.item.sourcePage,
          pdfSource: next.item.pdfSource,
          isNew: next.schedule === null,
          front: sides.front,
          back: sides.back,
          previews: {
            "1": previews[Rating.AGAIN],
            "2": previews[Rating.HARD],
            "3": previews[Rating.GOOD],
            "4": previews[Rating.EASY],
          },
        },
        counts,
      };
    },
    "study:rate": ({ workspaceId, itemId, rating, durationMs }) => {
      core.study(workspaceId).rate(itemId, rating as Rating, {
        ...(durationMs !== undefined ? { durationMs } : {}),
      });
      return {};
    },
    "study:undo": ({ workspaceId }) => ({ itemId: core.study(workspaceId).undo() }),
    "study:saveSettings": ({ workspaceId, ...changes }) =>
      core.study(workspaceId).updateSettings(changes),
    "practice:next": ({ workspaceId, filter, redo, exclude }) => {
      const practice = core.practice(workspaceId);
      return {
        question: practice.nextQuestion(filter, {
          ...(redo !== undefined ? { redo } : {}),
          ...(exclude ? { exclude } : {}),
        }),
        counts: practice.counts(filter),
      };
    },
    "practice:answer": ({ workspaceId, itemId, answer, seconds }) =>
      core.practice(workspaceId).answer(itemId, answer, {
        ...(seconds !== undefined ? { seconds } : {}),
      }),
    "practice:facets": ({ workspaceId }) => core.study(workspaceId).facets("question"),
    "practice:counts": ({ workspaceId, filter }) => core.practice(workspaceId).counts(filter),
    "errors:list": ({ workspaceId, topicId }) => {
      const notebook = core.notebook(workspaceId);
      return {
        entries: notebook.entries(topicId),
        counts: notebook.counts(),
        topics: core.topics(workspaceId).list(),
      };
    },
    "errors:makeCard": ({ workspaceId, questionId }) =>
      core.notebook(workspaceId).createCard(questionId),
    "topics:list": ({ workspaceId }) => ({ topics: core.topics(workspaceId).list() }),
    "topics:rename": ({ workspaceId, topicId, name }) =>
      core.topics(workspaceId).rename(topicId, name),
    "topics:merge": ({ workspaceId, sourceId, targetId }) =>
      core.topics(workspaceId).merge(sourceId, targetId),
    "topics:delete": ({ workspaceId, topicId }) => {
      core.topics(workspaceId).delete(topicId);
      return {};
    },
    "stats:overview": ({ workspaceId }) => {
      const stats = core.stats(workspaceId);
      return {
        summary: stats.summary(),
        topics: stats.topicStats(),
        weakest: stats.weakestTopics(),
        retention: stats.retention(),
        activity: stats.activity(),
      };
    },
    "chat:history": ({ workspaceId }) => ({ messages: core.chat(workspaceId).history() }),
    "chat:ask": ({ workspaceId, question }) => core.chat(workspaceId).ask(question),
    "chat:clear": ({ workspaceId }) => ({ cleared: core.chat(workspaceId).clear() }),
    "embeddings:status": ({ workspaceId }) => core.embeddings(workspaceId).status(),
    "embeddings:enable": ({ workspaceId }) => ({ jobId: core.embeddings(workspaceId).enable() }),
    "embeddings:disable": ({ workspaceId }) => {
      core.embeddings(workspaceId).disable();
      return {};
    },
    "settings:get": () => settingsView(core),
    "settings:save": (input) => {
      core.llm.settings.update({
        ...(input.generationModel !== undefined ? { generationModel: input.generationModel } : {}),
        ...(input.judgeModel !== undefined ? { judgeModel: input.judgeModel } : {}),
        ...(input.monthlyLimitUsd !== undefined ? { monthlyLimitUsd: input.monthlyLimitUsd } : {}),
      });
      if (input.apiKey?.trim()) core.llm.secrets.save(input.apiKey);
      // Only which settings changed is logged, never the values (the key is one of them).
      log.info("settings saved", {
        key: Boolean(input.apiKey?.trim()),
        models: input.generationModel !== undefined || input.judgeModel !== undefined,
        limit: input.monthlyLimitUsd !== undefined,
      });
      return {};
    },
    "settings:clearKey": () => {
      core.llm.secrets.clear();
      log.info("stored key removed");
      return {};
    },
    "settings:setConsent": ({ given }) => {
      const provider = core.llm.settings.get().provider;
      if (given) core.llm.consent.give(provider);
      else core.llm.consent.revoke(provider);
      log.info("consent changed", { given, provider });
      return {};
    },
    "settings:refreshModels": async () => ({
      refreshed: await core.llm.catalog.refresh(core.llm.fetch, true),
    }),
    "settings:testConnection": async () => {
      const result = await testConnection(core.llm.secrets, core.llm.fetch);
      log.info("connection test", { ok: result.ok });
      return result;
    },
    "settings:getCost": ({ year, month }) => ({
      total: core.llm.ledger.monthTotal(year, month),
      lines: core.llm.ledger.monthLines(year, month),
    }),
    "time:state": ({ workspaceId }) => core.time(workspaceId).state(),
    "time:start": ({ workspaceId, topicId }) => core.time(workspaceId).start(topicId),
    "time:pause": ({ workspaceId }) => core.time(workspaceId).pause(),
    "time:resume": ({ workspaceId }) => core.time(workspaceId).resume(),
    "time:stop": ({ workspaceId }) => core.time(workspaceId).stop(),
    "time:activity": ({ workspaceId, source, itemId, materialId }) => {
      core.time(workspaceId).activity(source, {
        ...(itemId !== undefined ? { itemId } : {}),
        ...(materialId !== undefined ? { materialId } : {}),
      });
      return {};
    },
    "time:blur": ({ workspaceId }) => {
      core.time(workspaceId).blur();
      return {};
    },
    "time:getSettings": ({ workspaceId }) => core.time(workspaceId).settings(),
    "time:saveSettings": ({ workspaceId, dailyGoalMin, idleSeconds, autoEnabled }) =>
      core.time(workspaceId).saveSettings({
        ...(dailyGoalMin !== undefined ? { dailyGoalMin } : {}),
        ...(idleSeconds !== undefined ? { idleSeconds } : {}),
        ...(autoEnabled !== undefined ? { autoEnabled } : {}),
      }),
    "time:stats": ({ workspaceId, days }) => core.time(workspaceId).stats(days),
    "time:sessions": ({ workspaceId, limit }) => ({
      sessions: core.time(workspaceId).sessions(limit),
    }),
    "time:deleteSession": ({ workspaceId, id }) => {
      core.time(workspaceId).deleteSession(id);
      return {};
    },
    "reader:info": ({ workspaceId, materialId }) => core.reader(workspaceId).info(materialId),
    "reader:page": ({ workspaceId, materialId, page, scale }) =>
      core.reader(workspaceId).page(materialId, page, scale),
    "reader:text": ({ workspaceId, materialId, page }) =>
      core.reader(workspaceId).text(materialId, page),
    "reader:search": ({ workspaceId, materialId, query }) =>
      core.reader(workspaceId).search(materialId, query),
    "reader:locate": async ({ workspaceId, materialId, page, quote }) => ({
      rects: await core.reader(workspaceId).locate(materialId, page, quote),
    }),
    "reader:savePosition": ({ workspaceId, materialId, page }) => {
      core.reader(workspaceId).savePosition(materialId, page);
      return {};
    },
    "reader:openWindow": ({ workspaceId, materialId, page }) => {
      core.reader(workspaceId).assertReadable(materialId);
      if (!ui.openReaderWindow) {
        throw new AppError("OPEN_FAILED", "Não foi possível abrir uma nova janela.");
      }
      ui.openReaderWindow({ workspaceId, materialId, ...(page !== undefined ? { page } : {}) });
      return {};
    },
    "material:openOriginal": async ({ workspaceId, materialId }) => {
      const { path } = core.reader(workspaceId).original(materialId);
      const failure = (await ui.openPath?.(path)) ?? "unavailable";
      if (failure) {
        throw new AppError(
          "OPEN_FAILED",
          "Não foi possível abrir o arquivo no aplicativo padrão do sistema.",
        );
      }
      return {};
    },
    "workspace:delete": ({ id }) => {
      core.releaseTime(id);
      core.registry.delete(id);
      return {};
    },
  };
}
