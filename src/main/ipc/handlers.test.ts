/*
 * Filename: handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/index.js";
import type { Core } from "../../core/index.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core;
let dispatch: ReturnType<typeof createRouter>;
let picked: string[] = [];
const routes = { lastRoute: null as string | null };

beforeEach(() => {
  routes.lastRoute = null;
  core = createCore({
    dataDir: tempDir(),
    env: {},
    fetch: () => Promise.reject(new Error("offline")),
  });
  dispatch = createRouter(
    createHandlers(core, routes, { pickFiles: () => Promise.resolve(picked) }),
    { error: () => undefined },
  );
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

describe("settings channels", () => {
  const KEY = "sk-or-v1-top-secret-key";

  it("returns defaults and never the key", async () => {
    const before = await dispatch("settings:get", {});
    expect(before).toMatchObject({
      ok: true,
      data: { provider: "openrouter", keyConfigured: false, keySource: null, consentGiven: false },
    });
    expect(await dispatch("settings:save", { apiKey: KEY, monthlyLimitUsd: 9 })).toEqual({
      ok: true,
      data: {},
    });
    const after = await dispatch("settings:get", {});
    expect(after).toMatchObject({
      ok: true,
      data: { keyConfigured: true, keySource: "stored", monthlyLimitUsd: 9 },
    });
    expect(JSON.stringify(after)).not.toContain("top-secret");
  });

  it("validates fields and keeps the previous values on error", async () => {
    const result = await dispatch("settings:save", { generationModel: "bad model!" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "generationModel" }] },
    });
    expect(await dispatch("settings:save", { apiKey: "has space" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("gives and revokes consent and clears the key", async () => {
    await dispatch("settings:save", { apiKey: KEY });
    await dispatch("settings:setConsent", { given: true });
    expect(await dispatch("settings:get", {})).toMatchObject({
      data: { consentGiven: true, keyConfigured: true },
    });
    await dispatch("settings:setConsent", { given: false });
    await dispatch("settings:clearKey", {});
    expect(await dispatch("settings:get", {})).toMatchObject({
      data: { consentGiven: false, keyConfigured: false },
    });
  });

  it("reports the cost of a month and refreshes the model catalog", async () => {
    const cost = await dispatch("settings:getCost", { year: 2026, month: 3 });
    expect(cost).toEqual({ ok: true, data: { total: 0, lines: [] } });
    expect(await dispatch("settings:getCost", { year: 2026, month: 13 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("settings:refreshModels", {})).toEqual({
      ok: true,
      data: { refreshed: false },
    });
  });
});

describe("material channels", () => {
  async function workspaceId(): Promise<number> {
    const created = await dispatch("workspace:create", { name: "Materiais" });
    return (created as { ok: true; data: { id: number } }).data.id;
  }

  function file(name: string, content: string): string {
    const path = join(tempDir(), name);
    writeFileSync(path, content);
    return path;
  }

  it("imports the chosen files, reports bad ones and lists the materials", async () => {
    const id = await workspaceId();
    picked = [file("bio.md", "# Biologia\n\nA célula é a unidade básica."), file("x.exe", "MZ")];
    const imported = await dispatch("material:import", { workspaceId: id });
    expect(imported).toMatchObject({
      ok: true,
      data: {
        materials: [{ title: "bio", status: "queued", filename: "bio.md" }],
        errors: [{ file: "x.exe", message: expect.stringContaining("não suportado") }],
      },
    });
    const material = (imported as { data: { materials: { id: number; jobId: number }[] } }).data
      .materials[0];
    await core.queue.wait(id, material?.jobId as number);
    expect(await dispatch("material:list", { workspaceId: id })).toMatchObject({
      ok: true,
      data: { materials: [{ status: "indexed", chunkCount: 1, progress: null }] },
    });
  });

  it("does nothing when the dialog is cancelled", async () => {
    const id = await workspaceId();
    picked = [];
    expect(await dispatch("material:import", { workspaceId: id })).toEqual({
      ok: true,
      data: { materials: [], errors: [] },
    });
  });

  it("previews chunks with pagination, searches and deletes", async () => {
    const id = await workspaceId();
    const paragraphs = Array.from(
      { length: 30 },
      (_, i) => `Bloco ${i} fotossíntese ${"z".repeat(1300)}`,
    );
    picked = [file("long.txt", paragraphs.join("\n\n"))];
    const imported = await dispatch("material:import", { workspaceId: id });
    const material = (imported as { data: { materials: { id: number; jobId: number }[] } }).data
      .materials[0];
    await core.queue.wait(id, material?.jobId as number);

    const first = await dispatch("material:chunks", {
      workspaceId: id,
      materialId: material?.id as number,
      limit: 10,
    });
    expect(first).toMatchObject({
      ok: true,
      data: { offset: 0, previousOffset: null, nextOffset: 10, total: 30 },
    });
    const second = await dispatch("material:chunks", {
      workspaceId: id,
      materialId: material?.id as number,
      offset: 10,
      limit: 10,
    });
    expect(second).toMatchObject({ data: { offset: 10, previousOffset: 0, nextOffset: 20 } });
    const chunkId = (second as { data: { chunks: { id: number }[] } }).data.chunks[4]?.id as number;
    expect(
      await dispatch("material:chunks", {
        workspaceId: id,
        materialId: material?.id as number,
        limit: 10,
        chunkId,
      }),
    ).toMatchObject({ data: { offset: 10 } });

    const hits = await dispatch("material:search", { workspaceId: id, query: "fotossintese" });
    expect(hits).toMatchObject({ ok: true, data: { hits: expect.any(Array) } });
    expect((hits as { data: { hits: unknown[] } }).data.hits.length).toBeGreaterThan(0);

    expect(
      await dispatch("material:delete", { workspaceId: id, id: material?.id as number }),
    ).toEqual({ ok: true, data: {} });
    expect(await dispatch("material:list", { workspaceId: id })).toEqual({
      ok: true,
      data: { materials: [] },
    });
    expect(await dispatch("material:chunks", { workspaceId: id, materialId: 99 })).toMatchObject({
      ok: false,
      error: { code: "MATERIAL_NOT_FOUND" },
    });
  });

  it("rejects an invalid address with a field error and creates nothing", async () => {
    const id = await workspaceId();
    expect(
      await dispatch("material:importUrl", { workspaceId: id, url: "ftp://x.com" }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "url" }] },
    });
    expect(await dispatch("material:list", { workspaceId: id })).toEqual({
      ok: true,
      data: { materials: [] },
    });
  });

  it("queues a valid address", async () => {
    const id = await workspaceId();
    const result = await dispatch("material:importUrl", {
      workspaceId: id,
      url: "http://127.0.0.1:9/pagina",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { kind: "url", sourceUrl: "http://127.0.0.1:9/pagina" },
    });
    await core.queue.shutdown();
  });
});
