/*
 * Filename: reader-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { copyFileSync, mkdirSync, realpathSync, rmSync } from "node:fs";
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

describe("open channels (FR-19, FR-20, FR-21, NFR-4)", () => {
  async function setup(
    ui: Partial<Parameters<typeof createHandlers>[2]> = {},
    kind = "pdf",
    file = "a.pdf",
  ) {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Abrir").id;
    const workspace = core.registry.open(workspaceId);
    mkdirSync(join(workspace.filesDir, "m1"), { recursive: true });
    copyFileSync(
      join(import.meta.dirname, "..", "..", "..", "fixtures", "pdfs", "three-pages.pdf"),
      join(workspace.filesDir, "m1", file),
    );
    const materialId = workspace.connection.db
      .insert(material)
      .values({ title: "a", kind, filename: file, storedPath: `files/m1/${file}` })
      .returning({ id: material.id })
      .get().id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]), ...ui }),
      { error: () => undefined },
    );
    return { dispatch, workspaceId, materialId, workspace };
  }

  it("asks the main process for a reader window of a readable PDF", async () => {
    const opened: unknown[] = [];
    const { dispatch, workspaceId, materialId } = await setup({
      openReaderWindow: (target) => opened.push(target),
    });
    expect(await dispatch("reader:openWindow", { workspaceId, materialId, page: 2 })).toEqual({
      ok: true,
      data: {},
    });
    expect(await dispatch("reader:openWindow", { workspaceId, materialId })).toEqual({
      ok: true,
      data: {},
    });
    expect(opened).toEqual([
      { workspaceId, materialId, page: 2 },
      { workspaceId, materialId },
    ]);
  });

  it("refuses a window for a non-PDF material, a missing one and when none can be opened", async () => {
    const { dispatch, workspaceId, materialId } = await setup({}, "md", "n.md");
    expect(await dispatch("reader:openWindow", { workspaceId, materialId })).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_FILE" },
    });
    expect(await dispatch("reader:openWindow", { workspaceId, materialId: 99 })).toMatchObject({
      ok: false,
      error: { code: "MATERIAL_NOT_FOUND" },
    });
    const pdf = await setup({});
    expect(
      await pdf.dispatch("reader:openWindow", {
        workspaceId: pdf.workspaceId,
        materialId: pdf.materialId,
      }),
    ).toMatchObject({ ok: false, error: { code: "OPEN_FAILED" } });
  });

  it("opens the resolved file in the system viewer, never a path from the window", async () => {
    const paths: string[] = [];
    const { dispatch, workspaceId, materialId, workspace } = await setup(
      {
        openPath: (path) => {
          paths.push(path);
          return Promise.resolve("");
        },
      },
      "docx",
      "a.docx",
    );
    expect(await dispatch("material:openOriginal", { workspaceId, materialId })).toEqual({
      ok: true,
      data: {},
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]?.startsWith(realpathSync(workspace.filesDir))).toBe(true);
    expect(
      await dispatch("material:openOriginal", { workspaceId, materialId, path: "/etc/passwd" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("reports a failure of the system viewer and a missing file", async () => {
    const { dispatch, workspaceId, materialId, workspace } = await setup({
      openPath: () => Promise.resolve("No application knows how to open it"),
    });
    expect(await dispatch("material:openOriginal", { workspaceId, materialId })).toMatchObject({
      ok: false,
      error: { code: "OPEN_FAILED" },
    });
    rmSync(join(workspace.filesDir, "m1"), { recursive: true });
    expect(await dispatch("material:openOriginal", { workspaceId, materialId })).toMatchObject({
      ok: false,
      error: { code: "FILE_MISSING" },
    });
  });
});

describe("quote and position channels, and the PDF source of items (FR-22, FR-23)", () => {
  it("locates a quote, saves the position and resumes it", async () => {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Fonte").id;
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
    expect(
      await dispatch("reader:locate", {
        workspaceId,
        materialId,
        page: 1,
        quote: "Primeira página",
      }),
    ).toMatchObject({
      ok: true,
      data: { rects: [expect.objectContaining({ width: expect.any(Number) })] },
    });
    expect(await dispatch("reader:savePosition", { workspaceId, materialId, page: 3 })).toEqual({
      ok: true,
      data: {},
    });
    expect(await dispatch("reader:info", { workspaceId, materialId })).toMatchObject({
      data: { lastPage: 3 },
    });
    expect(
      await dispatch("reader:locate", { workspaceId, materialId, page: 1, quote: "" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
