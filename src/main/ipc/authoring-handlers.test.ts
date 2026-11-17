/*
 * Filename: authoring-handlers.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider } from "../../core/llm/fake.js";
import { generationRig } from "../../core/test/generation-fixture.js";
import { World } from "../../core/test/world.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

function dispatcher(w: World) {
  return createRouter(
    createHandlers(w.rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
}

describe("items:create channel", () => {
  it("creates a card by hand and lists it as an item of the workspace (FR-1, FR-3)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const workspaceId = w.workspaceId;
    const created = await dispatch("items:create", {
      workspaceId,
      draft: { kind: "card", subtype: "qa", front: "Qual a capital da França?", back: "Paris." },
      topic: "Geografia",
      origin: "manual",
    });
    expect(created).toMatchObject({ ok: true, data: { topicCreated: true } });
    const listed = await dispatch("items:list", { workspaceId });
    expect(listed).toMatchObject({
      ok: true,
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            front: "Qual a capital da França?",
            status: "approved",
            topic: "Geografia",
          }),
        ]),
      },
    });
  });

  it("answers a validation error with the field that is wrong (FR-1)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const result = await dispatch("items:create", {
      workspaceId: w.workspaceId,
      draft: { kind: "card", subtype: "qa", front: "  ", back: "x" },
      origin: "manual",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "front" }] },
    });
  });

  it("rejects an origin the window must not claim and unknown fields (NFR-5)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const base = {
      workspaceId: w.workspaceId,
      draft: { kind: "card", subtype: "qa", front: "a", back: "b" },
    };
    expect(await dispatch("items:create", { ...base, origin: "generated" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("items:create", { ...base, origin: "manual", extra: 1 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
  it("creates a multiple choice question and refuses more than five alternatives (FR-2)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const workspaceId = w.workspaceId;
    const option = (key: string) => ({ key, text: `Texto ${key}`, why: `Motivo ${key}` });
    const draft = {
      kind: "question",
      subtype: "multiple_choice",
      statement: "Qual é a certa?",
      options: ["A", "B", "C"].map(option),
      answer: "B",
      explanation: "Porque sim.",
    };
    expect(await dispatch("items:create", { workspaceId, draft, origin: "manual" })).toMatchObject({
      ok: true,
    });
    expect(await dispatch("items:list", { workspaceId })).toMatchObject({
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({ kind: "question", front: "Qual é a certa?" }),
        ]),
      },
    });
    const six = { ...draft, options: ["A", "B", "C", "D", "E", "F"].map(option) };
    expect(
      await dispatch("items:create", { workspaceId, draft: six, origin: "manual" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      await dispatch("items:create", {
        workspaceId,
        draft: { ...draft, answer: "Z" },
        origin: "manual",
      }),
    ).toMatchObject({ ok: false, error: { fields: [{ field: "answer" }] } });
  });
  it("resolves a quote and creates an item that keeps its source (FR-4)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const base = { workspaceId: w.workspaceId, materialId: w.rig.materialId };
    expect(
      await dispatch("source:resolve", { ...base, page: 1, text: "converte a energia da luz" }),
    ).toMatchObject({
      ok: true,
      data: { match: "full", chunkId: w.rig.chunkIds[0], materialTitle: "Biologia" },
    });
    const created = await dispatch("items:create", {
      workspaceId: w.workspaceId,
      draft: { kind: "card", subtype: "qa", front: "O que a luz vira?", back: "Energia química." },
      origin: "manual",
      source: { materialId: w.rig.materialId, page: 1, quote: "converte a energia da luz" },
    });
    expect(created).toMatchObject({ ok: true, data: { sourceLinked: true } });
    expect(await dispatch("items:list", { workspaceId: w.workspaceId })).toMatchObject({
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            front: "O que a luz vira?",
            sourceTitle: "Biologia",
            sourcePage: 1,
          }),
        ]),
      },
    });
  });

  it("refuses an unknown material, a quote past the PDF limit and unknown fields (NFR-5)", async () => {
    const w = (world = new World());
    const dispatch = dispatcher(w);
    const workspaceId = w.workspaceId;
    expect(
      await dispatch("source:resolve", { workspaceId, materialId: 999, page: 1, text: "x" }),
    ).toMatchObject({ ok: false, error: { code: "MATERIAL_NOT_FOUND" } });
    const draft = { kind: "card", subtype: "qa", front: "a", back: "b" };
    const source = { materialId: w.rig.materialId, page: null, quote: "x".repeat(2001) };
    expect(
      await dispatch("items:create", { workspaceId, draft, origin: "manual", source }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      await dispatch("source:resolve", {
        workspaceId,
        materialId: 1,
        page: 1,
        text: "x",
        extra: 1,
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
  it("returns a proposal from the model without changing any item (FR-10, FR-11)", async () => {
    const provider = new FakeProvider();
    provider.script("AssistCard", { front: "Qual a função da mitocôndria?", back: "Produz ATP." });
    const rig = generationRig({ provider });
    try {
      const dispatch = createRouter(
        createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
        { error: () => undefined },
      );
      const before = await dispatch("items:list", { workspaceId: rig.workspaceId });
      const result = await dispatch("assist:improve", {
        workspaceId: rig.workspaceId,
        action: "fix",
        draft: { kind: "card", subtype: "qa", front: "Qual a funcao?", back: "Produz ATP" },
      });
      expect(result).toMatchObject({
        ok: true,
        data: {
          proposal: { kind: "card", front: "Qual a função da mitocôndria?", back: "Produz ATP." },
        },
      });
      expect(await dispatch("items:list", { workspaceId: rig.workspaceId })).toEqual(before);
      expect(
        await dispatch("assist:improve", {
          workspaceId: rig.workspaceId,
          action: "adjust",
          draft: { kind: "card", subtype: "qa", front: "a", back: "b" },
        }),
      ).toMatchObject({ ok: false, error: { fields: [{ field: "instruction" }] } });
      expect(
        await dispatch("assist:improve", {
          workspaceId: 999,
          action: "fix",
          draft: { kind: "card", subtype: "qa", front: "a", back: "b" },
        }),
      ).toMatchObject({ ok: false, error: { code: "WORKSPACE_NOT_FOUND" } });
      expect(
        await dispatch("assist:improve", {
          workspaceId: rig.workspaceId,
          action: "adjust",
          instruction: "x".repeat(501),
          draft: { kind: "card", subtype: "qa", front: "a", back: "b" },
        }),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    } finally {
      await rig.core.close();
    }
  });
  it("estimates, generates drafts from a passage and stores nothing (FR-7, FR-8, FR-9)", async () => {
    const provider = new FakeProvider({ promptTokens: 10, completionTokens: 5, costUsd: 0.01 });
    provider.script("SelectionCards", {
      cards: [
        {
          subtype: "qa",
          front: "O que a luz vira na fotossíntese?",
          back: "Energia química.",
          topic: "Biologia",
          quote: "converte a energia da luz em energia química",
        },
      ],
    });
    const rig = generationRig({ provider });
    try {
      const dispatch = createRouter(
        createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
        { error: () => undefined },
      );
      const request = {
        workspaceId: rig.workspaceId,
        materialId: rig.materialId,
        page: 1,
        text: "A fotossíntese converte a energia da luz em energia química nos cloroplastos.",
        kind: "card",
      };
      expect(await dispatch("selection:estimate", request)).toMatchObject({
        ok: true,
        data: { chars: expect.any(Number) },
      });
      const before = await dispatch("items:list", { workspaceId: rig.workspaceId });
      expect(await dispatch("selection:generate", request)).toMatchObject({
        ok: true,
        data: {
          drafts: [{ topic: "Biologia", quote: "converte a energia da luz em energia química" }],
          discarded: { noSource: 0, invalid: 0, duplicate: 0 },
          costUsd: 0.01,
        },
      });
      expect(await dispatch("items:list", { workspaceId: rig.workspaceId })).toEqual(before);
      // The limits are part of the contract: the window cannot ask for more.
      for (const change of [
        { quantity: 21 },
        { text: "a".repeat(8001) },
        { subject: "x".repeat(201) },
      ]) {
        expect(await dispatch("selection:generate", { ...request, ...change })).toMatchObject({
          ok: false,
          error: { code: "VALIDATION_ERROR" },
        });
      }
    } finally {
      await rig.core.close();
    }
  });
  it("saves a template where the person chose, and nothing when the dialog is cancelled (FR-13)", async () => {
    const w = (world = new World());
    const dir = mkdtempSync(join(tmpdir(), "mind-template-"));
    try {
      let chosen: string | null = join(dir, "cartoes.csv");
      const asked: string[] = [];
      const dispatch = createRouter(
        createHandlers(
          w.rig.core,
          { lastRoute: null },
          {
            pickFiles: () => Promise.resolve([]),
            pickSavePath: (name) => {
              asked.push(name);
              return Promise.resolve(chosen);
            },
          },
        ),
        { error: () => undefined },
      );
      const workspaceId = w.workspaceId;
      expect(
        await dispatch("import:template", { workspaceId, kind: "card", format: "csv" }),
      ).toMatchObject({ ok: true, data: { saved: true } });
      expect(asked).toEqual(["modelo-cartoes.csv"]);
      expect(readFileSync(join(dir, "cartoes.csv"), "utf8")).toContain(
        "subtipo;frente;verso;topico",
      );
      chosen = join(dir, "questoes.xlsx");
      expect(
        await dispatch("import:template", { workspaceId, kind: "question", format: "xlsx" }),
      ).toMatchObject({ ok: true, data: { saved: true } });
      expect(readFileSync(join(dir, "questoes.xlsx")).subarray(0, 2).toString("latin1")).toBe("PK");
      chosen = null;
      expect(
        await dispatch("import:template", { workspaceId, kind: "card", format: "xlsx" }),
      ).toMatchObject({ ok: true, data: { saved: false } });
      expect(existsSync(join(dir, "modelo-cartoes.xlsx"))).toBe(false);
      expect(
        await dispatch("import:template", { workspaceId: 999, kind: "card", format: "csv" }),
      ).toMatchObject({ ok: false, error: { code: "WORKSPACE_NOT_FOUND" } });
      expect(
        await dispatch("import:template", { workspaceId, kind: "deck", format: "csv" }),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
