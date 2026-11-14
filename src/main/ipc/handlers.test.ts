/*
 * Filename: handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/index.js";
import type { Core } from "../../core/index.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core;
let dispatch: ReturnType<typeof createRouter>;
const routes = { lastRoute: null as string | null };

beforeEach(() => {
  routes.lastRoute = null;
  core = createCore({ dataDir: tempDir() });
  dispatch = createRouter(createHandlers(core, routes), { error: () => undefined });
});

afterEach(async () => {
  await core.close();
});

describe("IPC handlers", () => {
  it("creates, lists, renames and deletes workspaces through the router", async () => {
    const created = await dispatch("workspace:create", { name: "Estudos" });
    expect(created).toMatchObject({ ok: true, data: { name: "Estudos" } });
    const id = (created as { ok: true; data: { id: number } }).data.id;

    expect(await dispatch("workspace:list", {})).toMatchObject({
      ok: true,
      data: { workspaces: [{ id, name: "Estudos" }] },
    });
    expect(await dispatch("workspace:rename", { id, name: "Outro" })).toMatchObject({
      ok: true,
      data: { name: "Outro" },
    });
    expect(await dispatch("workspace:delete", { id })).toEqual({ ok: true, data: {} });
    expect(await dispatch("workspace:list", {})).toEqual({ ok: true, data: { workspaces: [] } });
  });

  it("reports validation and not-found errors with stable codes", async () => {
    expect(await dispatch("workspace:create", { name: "   " })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "name" }] },
    });
    expect(await dispatch("workspace:delete", { id: 7 })).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
    expect(await dispatch("workspace:rename", { id: -1, name: "x" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("keeps the last route in the route store", async () => {
    await dispatch("window:setLastRoute", { route: "/w/1/study" });
    expect(routes.lastRoute).toBe("/w/1/study");
    expect(await dispatch("window:getState", {})).toMatchObject({
      ok: true,
      data: { route: "/w/1/study" },
    });
  });
});
