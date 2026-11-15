/*
 * Filename: router.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it, vi } from "vitest";
import { AppError, CONTRACT_VERSION } from "../../core/contracts/index.js";
import { createRouter } from "./router.js";
import type { Handlers } from "./router.js";

function handlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    "window:getState": () => ({ route: "/library", contractVersion: CONTRACT_VERSION }),
    "window:setLastRoute": () => ({}),
    "workspace:list": () => ({ workspaces: [] }),
    "workspace:create": () => ({ id: 1, name: "x", createdAt: "x" }),
    "workspace:rename": () => ({ id: 1, name: "x", createdAt: "x" }),
    "workspace:delete": () => ({}),
    "time:state": () => {
      throw new Error("unused");
    },
    "time:start": () => {
      throw new Error("unused");
    },
    "time:pause": () => {
      throw new Error("unused");
    },
    "time:resume": () => {
      throw new Error("unused");
    },
    "time:stop": () => {
      throw new Error("unused");
    },
    "time:activity": () => ({}),
    "time:blur": () => ({}),
    "time:getSettings": () => ({ dailyGoalMin: 60, idleSeconds: 120, autoEnabled: true }),
    "time:saveSettings": () => ({ dailyGoalMin: 60, idleSeconds: 120, autoEnabled: true }),
    "time:stats": () => ({
      totalSeconds: 0,
      avgPerDaySeconds: 0,
      bestDay: null,
      byDay: [],
      byTopic: [],
      byMaterial: [],
    }),
    "time:sessions": () => ({ sessions: [] }),
    "time:deleteSession": () => ({}),
    "reader:info": () => ({ title: "t", pageCount: 0, pages: [], lastPage: null }),
    "reader:page": () => ({ dataUrl: "data:image/png;base64,AA", width: 1, height: 1 }),
    "reader:text": () => ({ width: 1, height: 1, lines: [] }),
    "reader:search": () => ({ hits: [], truncated: false }),
    "reader:locate": () => ({ rects: [] }),
    "reader:savePosition": () => ({}),
    "update:state": () => ({ enabled: true, current: "0.0.0", available: null, checkedAt: null }),
    "update:check": () => ({
      outcome: "current" as const,
      state: { enabled: true, current: "0.0.0", available: null, checkedAt: null },
      release: null,
    }),
    "update:setEnabled": () => ({
      enabled: true,
      current: "0.0.0",
      available: null,
      checkedAt: null,
    }),
    "update:dismiss": () => ({ enabled: true, current: "0.0.0", available: null, checkedAt: null }),
    "update:openRelease": () => ({}),
    "reader:openWindow": () => ({}),
    "material:openOriginal": () => ({}),
    "today:summary": () => ({ materials: 0, cards: 0, questions: 0 }),
    "material:list": () => ({ materials: [] }),
    "material:import": () => ({ materials: [], errors: [] }),
    "material:importUrl": () => {
      throw new Error("unused");
    },
    "material:rename": () => {
      throw new Error("unused");
    },
    "material:delete": () => ({}),
    "material:chunks": () => {
      throw new Error("unused");
    },
    "material:search": () => ({ hits: [] }),
    "generation:estimate": () => {
      throw new Error("unused");
    },
    "generation:start": () => {
      throw new Error("unused");
    },
    "generation:cancel": () => ({ cancelled: false }),
    "generation:list": () => ({ runs: [] }),
    "generation:get": () => {
      throw new Error("unused");
    },
    "review:list": () => {
      throw new Error("unused");
    },
    "review:get": () => {
      throw new Error("unused");
    },
    "review:approve": () => ({ approved: 0, discarded: 0, skipped: 0 }),
    "review:discard": () => ({ approved: 0, discarded: 0, skipped: 0 }),
    "review:approveAll": () => ({ approved: 0, discarded: 0, skipped: 0 }),
    "review:discardApproved": () => ({ discarded: false }),
    "review:restore": () => ({ status: null }),
    "review:edit": () => {
      throw new Error("unused");
    },
    "study:today": () => {
      throw new Error("unused");
    },
    "study:next": () => {
      throw new Error("unused");
    },
    "study:rate": () => ({}),
    "study:undo": () => ({ itemId: null }),
    "study:saveSettings": () => ({
      newPerDay: 20,
      dailyGoal: 40,
      desiredRetention: 0.9,
      maximumInterval: 36500,
      learningSteps: "1m 10m",
      relearningSteps: "10m",
      enableFuzz: true,
    }),
    "practice:next": () => {
      throw new Error("unused");
    },
    "practice:answer": () => {
      throw new Error("unused");
    },
    "practice:facets": () => ({
      topics: [],
      materials: [],
      subtypes: [],
      cards: 0,
      questions: 0,
    }),
    "practice:counts": () => ({
      unseen: 0,
      retry: 0,
      answeredToday: 0,
      correctToday: 0,
      toPractice: 0,
    }),
    "errors:list": () => {
      throw new Error("unused");
    },
    "errors:makeCard": () => ({ itemId: 1, created: true }),
    "topics:list": () => ({ topics: [] }),
    "topics:rename": () => {
      throw new Error("unused");
    },
    "topics:merge": () => {
      throw new Error("unused");
    },
    "topics:delete": () => ({}),
    "items:list": () => ({ items: [] }),
    "items:bulk": () => ({ changed: 0, skipped: 0 }),
    "stats:materials": () => ({ materials: [] }),
    "stats:overview": () => {
      throw new Error("unused");
    },
    "workspace:export": () => ({ cancelled: true, path: null }),
    "workspace:import": () => ({ cancelled: true, workspace: null }),
    "chat:history": () => ({ messages: [] }),
    "chat:ask": () => {
      throw new Error("unused");
    },
    "chat:clear": () => ({ cleared: 0 }),
    "embeddings:status": () => ({
      modelReady: false,
      enabled: false,
      indexed: 0,
      total: 0,
      model: "m",
      job: null,
    }),
    "embeddings:enable": () => ({ jobId: null }),
    "embeddings:disable": () => ({}),
    "settings:get": () => ({
      provider: "openrouter",
      generationModel: "a",
      judgeModel: "b",
      monthlyLimitUsd: 5,
      keyConfigured: false,
      keySource: null,
      consentGiven: false,
      consentAcceptedAt: null,
      spentThisMonth: 0,
      month: "2026-01",
      knownModels: [],
    }),
    "settings:save": () => ({}),
    "settings:clearKey": () => ({}),
    "settings:setConsent": () => ({}),
    "settings:refreshModels": () => ({ refreshed: true }),
    "settings:testConnection": () => ({ ok: true, message: "ok" }),
    "settings:getCost": () => ({ total: 0, lines: [] }),
    ...overrides,
  };
}

const quietLogger = { error: vi.fn() };

describe("IPC router", () => {
  it("returns the handler answer wrapped in an ok result", async () => {
    const dispatch = createRouter(handlers(), quietLogger);
    expect(await dispatch("window:getState", {})).toEqual({
      ok: true,
      data: { route: "/library", contractVersion: CONTRACT_VERSION },
    });
  });

  it("rejects an unknown channel and a non-string channel", async () => {
    const dispatch = createRouter(handlers(), quietLogger);
    for (const channel of ["nope", "__proto__", "constructor", 42, null]) {
      const result = await dispatch(channel, {});
      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("rejects an invalid payload with field errors and never calls the handler", async () => {
    const setLastRoute = vi.fn(() => ({}));
    const dispatch = createRouter(handlers({ "window:setLastRoute": setLastRoute }), quietLogger);
    const result = await dispatch("window:setLastRoute", { route: "https://evil.example" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(setLastRoute).not.toHaveBeenCalled();
    const extra = await dispatch("window:setLastRoute", { route: "/ok", extra: 1 });
    expect(extra).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("turns an AppError into a stable error result", async () => {
    const dispatch = createRouter(
      handlers({
        "window:getState": () => {
          throw new AppError("WORKSPACE_NOT_FOUND", "Workspace não encontrado.");
        },
      }),
      quietLogger,
    );
    expect(await dispatch("window:getState", {})).toEqual({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace não encontrado." },
    });
  });

  it("hides unexpected errors behind INTERNAL_ERROR and logs them", async () => {
    const logger = { error: vi.fn() };
    const dispatch = createRouter(
      handlers({
        "window:getState": () => {
          throw new Error("secret detail");
        },
      }),
      logger,
    );
    const result = await dispatch("window:getState", {});
    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Erro interno." },
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it("rejects an answer that breaks the channel contract", async () => {
    const dispatch = createRouter(
      handlers({
        "window:getState": () => ({ route: 7, contractVersion: 1 }) as never,
      }),
      quietLogger,
    );
    expect(await dispatch("window:getState", {})).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("supports asynchronous handlers", async () => {
    const dispatch = createRouter(
      handlers({ "window:setLastRoute": async () => Promise.resolve({}) }),
      quietLogger,
    );
    expect(await dispatch("window:setLastRoute", { route: "/study" })).toEqual({
      ok: true,
      data: {},
    });
  });
});
