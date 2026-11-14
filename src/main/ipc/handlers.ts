/*
 * Filename: handlers.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { CONTRACT_VERSION } from "../../core/contracts/index.js";
import type { Core } from "../../core/core.js";
import type { Handlers } from "./router.js";

/** The last route is a tiny piece of window state kept outside the databases. */
export interface RouteStore {
  lastRoute: string | null;
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
    "workspace:delete": ({ id }) => {
      core.registry.delete(id);
      return {};
    },
  };
}
