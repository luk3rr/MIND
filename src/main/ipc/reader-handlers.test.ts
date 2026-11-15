/*
 * Filename: reader-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/core.js";
import type { Core } from "../../core/core.js";
import { material } from "../../core/db/workspace-schema.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

describe("reader channels", () => {
  it("serves the info, a page, its text and a search through the validated channels (FR-15..17)", async () => {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Leitor").id;
    const workspace = core.registry.open(workspaceId);
    mkdirSync(join(workspace.filesDir, "m1"), { recursive: true });
    copyFileSync(
      join(import.meta.dirname, "..", "..", "..", "fixtures", "pdfs", "three-pages.pdf"),
      join(workspace.filesDir, "m1", "a.pdf"),
    );
    const materialId = workspace.connection.db
      .insert(material)
      .values({ title: "a", kind: "pdf", filename: "a.pdf", storedPath: "files/m1/a.pdf" })
      .returning({ id: material.id })
      .get().id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(await dispatch("reader:info", { workspaceId, materialId })).toMatchObject({
      ok: true,
      data: { pageCount: 3 },
    });
    expect(
      await dispatch("reader:page", { workspaceId, materialId, page: 1, scale: 1 }),
    ).toMatchObject({
      ok: true,
      data: { width: 595, height: 842 },
    });
    expect(await dispatch("reader:text", { workspaceId, materialId, page: 3 })).toMatchObject({
      ok: true,
      data: { lines: [expect.objectContaining({ text: expect.stringContaining("página") })] },
    });
    expect(
      await dispatch("reader:search", { workspaceId, materialId, query: "função" }),
    ).toMatchObject({
      ok: true,
      data: { truncated: false, hits: [{ page: 1 }] },
    });
  });

  it("rejects invalid payloads and reports missing materials", async () => {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Leitor").id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(
      await dispatch("reader:page", { workspaceId, materialId: 1, page: 1, scale: 9 }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      await dispatch("reader:search", { workspaceId, materialId: 1, query: "" }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("reader:info", { workspaceId, materialId: 7 })).toMatchObject({
      ok: false,
      error: { code: "MATERIAL_NOT_FOUND" },
    });
  });
});
