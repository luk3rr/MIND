/*
 * Filename: handlers.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { CONTRACT_VERSION } from "../../core/contracts/index.js";
import type { OutputOf } from "../../core/contracts/index.js";
import type { Core } from "../../core/core.js";
import { todaySummary } from "../../core/today/summary.js";
import type { Handlers } from "./router.js";

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
export function createHandlers(core: Core, routes: RouteStore): Handlers {
  return {
    "window:getState": () => ({ route: routes.lastRoute, contractVersion: CONTRACT_VERSION }),
    "window:setLastRoute": ({ route }) => {
      routes.lastRoute = route;
      return {};
    },
    "workspace:list": () => ({ workspaces: core.registry.list() }),
    "workspace:create": ({ name }) => core.registry.create(name),
    "workspace:rename": ({ id, name }) => core.registry.rename(id, name),
    "today:summary": ({ workspaceId }) => todaySummary(core.registry.open(workspaceId)),
    "settings:get": () => settingsView(core),
    "settings:save": (input) => {
      core.llm.settings.update({
        ...(input.generationModel !== undefined ? { generationModel: input.generationModel } : {}),
        ...(input.judgeModel !== undefined ? { judgeModel: input.judgeModel } : {}),
        ...(input.monthlyLimitUsd !== undefined ? { monthlyLimitUsd: input.monthlyLimitUsd } : {}),
      });
      if (input.apiKey?.trim()) core.llm.secrets.save(input.apiKey);
      return {};
    },
    "settings:clearKey": () => {
      core.llm.secrets.clear();
      return {};
    },
    "settings:setConsent": ({ given }) => {
      const provider = core.llm.settings.get().provider;
      if (given) core.llm.consent.give(provider);
      else core.llm.consent.revoke(provider);
      return {};
    },
    "settings:refreshModels": async () => ({
      refreshed: await core.llm.catalog.refresh(core.llm.fetch, true),
    }),
    "settings:getCost": ({ year, month }) => ({
      total: core.llm.ledger.monthTotal(year, month),
      lines: core.llm.ledger.monthLines(year, month),
    }),
    "workspace:delete": ({ id }) => {
      core.registry.delete(id);
      return {};
    },
  };
}
