/*
 * Filename: backup-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/core.js";
import type { Core } from "../../core/core.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import type { UiBridge } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

function setup(ui: Partial<UiBridge>) {
  core = createCore({ dataDir: tempDir(), env: {} });
  const id = core.registry.create("Biologia").id;
  const dispatch = createRouter(
    createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]), ...ui }),
    { error: () => undefined },
  );
  return { dispatch, id, core };
}

describe("backup channels (FR-22)", () => {
  it("exports to the chosen path and imports it back", async () => {
    const dir = tempDir();
    const target = join(dir, "backup.zip");
    let suggested = "";
    const { dispatch, id } = setup({
      appVersion: "9.9.9",
      pickSavePath: (name) => {
        suggested = name;
        return Promise.resolve(target);
      },
      pickBackup: () => Promise.resolve(target),
    });
    expect(await dispatch("workspace:export", { id })).toEqual({
      ok: true,
      data: { cancelled: false, path: target },
    });
    expect(suggested).toMatch(/^mind-biologia-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(existsSync(target)).toBe(true);
    const imported = await dispatch("workspace:import", {});
    expect(imported).toMatchObject({
      ok: true,
      data: { cancelled: false, workspace: { name: "Biologia (importado)" } },
    });
    expect(await dispatch("workspace:list", {})).toMatchObject({
      data: { workspaces: [{ name: "Biologia" }, { name: "Biologia (importado)" }] },
    });
  });

  it("does nothing when the dialogs are cancelled or missing", async () => {
    const { dispatch, id } = setup({
      pickSavePath: () => Promise.resolve(null),
      pickBackup: () => Promise.resolve(null),
    });
    expect(await dispatch("workspace:export", { id })).toEqual({
      ok: true,
      data: { cancelled: true, path: null },
    });
    expect(await dispatch("workspace:import", {})).toEqual({
      ok: true,
      data: { cancelled: true, workspace: null },
    });
    const bare = setup({});
    expect(await bare.dispatch("workspace:export", { id: bare.id })).toMatchObject({
      data: { cancelled: true },
    });
    expect(await bare.dispatch("workspace:import", {})).toMatchObject({
      data: { cancelled: true },
    });
  });

  it("reports an unknown workspace and an invalid backup with stable codes", async () => {
    const dir = tempDir();
    const bogus = join(dir, "x.zip");
    const { dispatch } = setup({
      pickSavePath: () => Promise.resolve(join(dir, "y.zip")),
      pickBackup: () => Promise.resolve(bogus),
    });
    expect(await dispatch("workspace:export", { id: 99 })).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
    expect(await dispatch("workspace:import", {})).toMatchObject({
      ok: false,
      error: { code: "ARCHIVE_INVALID" },
    });
  });
});
