/*
 * Filename: import-handlers.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tempDir } from "../../core/test/helpers.js";
import { World } from "../../core/test/world.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

function dispatcher(w: World, pick: () => Promise<string | null>) {
  return createRouter(
    createHandlers(
      w.rig.core,
      { lastRoute: null },
      { pickFiles: () => Promise.resolve([]), pickImportFile: pick },
    ),
    { error: () => undefined },
  );
}

const CSV = "subtipo;frente;verso;topico\r\n;Pergunta 1?;Resposta 1.;Tema\r\n;;Sem frente;\r\n";

describe("import preview channels (FR-14, FR-15, NFR-2, NFR-5)", () => {
  it("opens the dialog in the core, so the window never sees the path, and returns the preview", async () => {
    const w = (world = new World());
    const path = join(tempDir(), "cartoes.csv");
    writeFileSync(path, CSV);
    const dispatch = dispatcher(w, () => Promise.resolve(path));
    const result = await dispatch("import:preview", { workspaceId: w.workspaceId, kind: "card" });
    expect(result).toMatchObject({
      ok: true,
      data: {
        cancelled: false,
        fileName: "cartoes.csv",
        totals: { rows: 2, valid: 1, errors: 1, duplicates: 0 },
        newTopics: ["Tema"],
        truncated: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain(path);
    const data = (result as { data: { token: string } }).data;
    expect(
      await dispatch("import:previewRows", {
        workspaceId: w.workspaceId,
        token: data.token,
        status: "error",
        offset: 0,
        limit: 10,
      }),
    ).toMatchObject({
      ok: true,
      data: { total: 1, rows: [{ line: 3, problem: "A frente do card não pode ficar vazia." }] },
    });
    expect(
      await dispatch("import:discard", { workspaceId: w.workspaceId, token: data.token }),
    ).toEqual({
      ok: true,
      data: {},
    });
    expect(
      await dispatch("import:previewRows", {
        workspaceId: w.workspaceId,
        token: data.token,
        status: "all",
        offset: 0,
        limit: 10,
      }),
    ).toMatchObject({ ok: false, error: { code: "IMPORT_EXPIRED" } });
  });

  it("answers a cancelled dialog without reading anything", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w, () => Promise.resolve(null));
    expect(await dispatch("import:preview", { workspaceId: w.workspaceId, kind: "card" })).toEqual({
      ok: true,
      data: { cancelled: true },
    });
  });

  it("turns a refused file into a stable error and an unknown workspace into its own", async () => {
    const w = (world = new World());
    const path = join(tempDir(), "estranho.txt");
    writeFileSync(path, "x");
    const dispatch = dispatcher(w, () => Promise.resolve(path));
    expect(
      await dispatch("import:preview", { workspaceId: w.workspaceId, kind: "card" }),
    ).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_FILE", message: "Use um arquivo .csv ou .xlsx." },
    });
    expect(await dispatch("import:preview", { workspaceId: 999, kind: "card" })).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
  });

  it("keeps the window to the contract: known kinds, pages of at most 500, no extra fields", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w, () => Promise.resolve(null));
    const workspaceId = w.workspaceId;
    const rows = { workspaceId, token: "t", status: "all", offset: 0, limit: 10 };
    for (const bad of [
      { workspaceId, kind: "deck" },
      { workspaceId, kind: "card", path: "/etc/passwd" },
    ]) {
      expect(await dispatch("import:preview", bad)).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
    for (const change of [
      { limit: 501 },
      { limit: 0 },
      { offset: -1 },
      { status: "todas" },
      { extra: 1 },
    ]) {
      expect(await dispatch("import:previewRows", { ...rows, ...change })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });
  it("stores what the core parsed and answers with the result, using up the token (FR-16)", async () => {
    const w = (world = new World());
    const path = join(tempDir(), "cartoes.csv");
    writeFileSync(path, `${CSV};Pergunta 3?;Resposta 3.;Tema\r\n`);
    const dispatch = dispatcher(w, () => Promise.resolve(path));
    const workspaceId = w.workspaceId;
    const result = await dispatch("import:preview", { workspaceId, kind: "card" });
    const { token } = (result as { data: { token: string } }).data;
    expect(await dispatch("import:commit", { workspaceId, token, includeDuplicates: [] })).toEqual({
      ok: true,
      data: { imported: 2, skippedDuplicates: 0, skippedErrors: 1, topicsCreated: 1 },
    });
    expect(await dispatch("items:list", { workspaceId })).toMatchObject({
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            front: "Pergunta 1?",
            origin: "import",
            status: "approved",
            topic: "Tema",
          }),
          expect.objectContaining({ front: "Pergunta 3?", origin: "import" }),
        ]),
      },
    });
    expect(
      await dispatch("import:commit", { workspaceId, token, includeDuplicates: [] }),
    ).toMatchObject({
      ok: false,
      error: { code: "IMPORT_EXPIRED" },
    });
  });

  it("keeps the window to the contract when confirming: lines are positive whole numbers, no extras", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w, () => Promise.resolve(null));
    const base = { workspaceId: w.workspaceId, token: "t", includeDuplicates: [] as number[] };
    for (const change of [
      { includeDuplicates: [0] },
      { includeDuplicates: [1.5] },
      { includeDuplicates: Array.from({ length: 5001 }, (_, i) => i + 1) },
      { extra: true },
      { token: "x".repeat(101) },
    ]) {
      expect(await dispatch("import:commit", { ...base, ...change })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
    expect(await dispatch("import:commit", { ...base, workspaceId: 999 })).toMatchObject({
      ok: false,
      error: { code: "IMPORT_EXPIRED" },
    });
  });
});
