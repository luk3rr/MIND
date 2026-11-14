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

export interface FakeState {
  workspaces: Workspace[];
  route: string | null;
  summary: OutputOf<"today:summary"> | ErrorInfo;
  nextId: number;
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
  };
}

/** An in-memory `window.mind` that behaves like the real core for the channels the UI uses. */
export function installFakeMind(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    workspaces: [],
    route: null,
    summary: { materials: 0, cards: 0, questions: 0 },
    nextId: 1,
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
      case "settings:refreshModels":
        return ok({ refreshed: state.provider.refreshWorks });
      case "settings:getCost":
        return ok({
          total: state.provider.lines.reduce((sum, line) => sum + line.costUsd, 0),
          lines: state.provider.lines,
        });
      case "today:summary":
        return "code" in state.summary ? { ok: false, error: state.summary } : ok(state.summary);
    }
  });

  const mind = { invoke, on: vi.fn(() => () => undefined) } as unknown as MindApi;
  Object.defineProperty(window, "mind", { value: mind, configurable: true, writable: true });
  Object.defineProperty(globalThis, "__APP_VERSION__", { value: "0.0.0-test", configurable: true });
  return { state, invoke };
}
