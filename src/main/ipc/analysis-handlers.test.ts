/*
 * Filename: analysis-handlers.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider } from "../../core/llm/fake.js";
import { generationRig } from "../../core/test/generation-fixture.js";
import type { GenerationRig } from "../../core/test/generation-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function open() {
  const provider = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0.01 });
  provider.script("ClassifyBatch", (messages: readonly { content: string }[]) => {
    const total = (messages.at(-1)?.content.match(/\[excerpt \d+\]/g) ?? []).length;
    return {
      subject: "Biologia celular",
      chunks: Array.from({ length: total }, (_, index) => ({
        index,
        role: "concept",
        starts_unit: true,
      })),
    };
  });
  rig = generationRig({ provider });
  const dispatch = createRouter(
    createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
  return { dispatch, workspaceId: rig.workspaceId, materialId: rig.materialId, core: rig.core };
}

describe("material:analyze and the analysis in the material list (FR-9, NFR-8)", () => {
  it("lists the subject and the analysis of each material", async () => {
    const { dispatch, workspaceId } = open();
    const listed = await dispatch("material:list", { workspaceId });
    expect(listed).toMatchObject({
      ok: true,
      data: {
        materials: [
          {
            title: "Biologia",
            subject: { value: "Biologia", source: "title", informed: null, inferred: null },
            analysis: { state: "none", progress: null, errorCode: null, analyzedAt: null },
          },
        ],
      },
    });
  });

  it("starts the analysis, and asking again while it runs starts nothing", async () => {
    const { dispatch, workspaceId, materialId, core } = open();
    const first = await dispatch("material:analyze", { workspaceId, id: materialId });
    expect(first).toMatchObject({
      ok: true,
      data: { started: true, analysis: { state: "analyzing" } },
    });
    const second = await dispatch("material:analyze", { workspaceId, id: materialId });
    expect(second).toMatchObject({ ok: true, data: { started: false } });
    const jobId = core.registry
      .open(workspaceId)
      .connection.sqlite.prepare("SELECT analysis_job_id AS id FROM material")
      .get() as { id: number };
    await core.queue.wait(workspaceId, jobId.id);
    const listed = await dispatch("material:list", { workspaceId });
    expect(listed).toMatchObject({
      ok: true,
      data: {
        materials: [
          {
            subject: { value: "Biologia celular", source: "inferred" },
            analysis: { state: "done" },
          },
        ],
      },
    });
  });

  it("rejects an unknown material and an invalid request", async () => {
    const { dispatch, workspaceId } = open();
    expect(await dispatch("material:analyze", { workspaceId, id: 999 })).toMatchObject({
      ok: false,
      error: { code: "MATERIAL_NOT_FOUND" },
    });
    expect(await dispatch("material:analyze", { workspaceId, id: 0 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      await dispatch("material:analyze", { workspaceId, id: 1, extra: true } as never),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("material:setSubject (FR-14)", () => {
  it("makes the subject the person names win, tidied, and clearing it goes back to the inferred one", async () => {
    const { dispatch, workspaceId, materialId, core } = open();
    await dispatch("material:analyze", { workspaceId, id: materialId });
    const jobId = core.registry
      .open(workspaceId)
      .connection.sqlite.prepare("SELECT analysis_job_id AS id FROM material")
      .get() as { id: number };
    await core.queue.wait(workspaceId, jobId.id);

    const named = await dispatch("material:setSubject", {
      workspaceId,
      id: materialId,
      subject: "  Fotossíntese   e respiração ",
    });
    expect(named).toMatchObject({
      ok: true,
      data: {
        subject: {
          value: "Fotossíntese e respiração",
          source: "informed",
          informed: "Fotossíntese e respiração",
          inferred: "Biologia celular",
        },
        analysis: { state: "done" },
      },
    });
    // Naming a subject analyzes nothing again.
    expect(
      (
        core.registry
          .open(workspaceId)
          .connection.sqlite.prepare("SELECT analysis_job_id AS id FROM material")
          .get() as { id: number }
      ).id,
    ).toBe(jobId.id);

    for (const cleared of [null, "   "]) {
      const back = await dispatch("material:setSubject", {
        workspaceId,
        id: materialId,
        subject: cleared,
      });
      expect(back).toMatchObject({
        ok: true,
        data: { subject: { value: "Biologia celular", source: "inferred", informed: null } },
      });
    }
  });

  it("falls back to the title when there is nothing inferred either", async () => {
    const { dispatch, workspaceId, materialId } = open();
    expect(
      await dispatch("material:setSubject", { workspaceId, id: materialId, subject: null }),
    ).toMatchObject({ ok: true, data: { subject: { value: "Biologia", source: "title" } } });
  });

  it("rejects a subject that is too long, an unknown material and extra fields", async () => {
    const { dispatch, workspaceId, materialId } = open();
    expect(
      await dispatch("material:setSubject", {
        workspaceId,
        id: materialId,
        subject: "x".repeat(201),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      await dispatch("material:setSubject", { workspaceId, id: 999, subject: "x" }),
    ).toMatchObject({ ok: false, error: { code: "MATERIAL_NOT_FOUND" } });
    expect(
      await dispatch("material:setSubject", {
        workspaceId,
        id: materialId,
        subject: "x",
        extra: 1,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("the labels of the chunks over the channels (FR-8)", () => {
  async function analyzed() {
    const ctx = open();
    await ctx.dispatch("material:analyze", { workspaceId: ctx.workspaceId, id: ctx.materialId });
    const job = ctx.core.registry
      .open(ctx.workspaceId)
      .connection.sqlite.prepare("SELECT analysis_job_id AS id FROM material")
      .get() as { id: number };
    await ctx.core.queue.wait(ctx.workspaceId, job.id);
    return ctx;
  }

  it("lists the role and the unit of each chunk, filters by role and corrects one", async () => {
    const { dispatch, workspaceId, materialId } = await analyzed();
    const all = await dispatch("material:chunks", { workspaceId, materialId });
    expect(all).toMatchObject({
      ok: true,
      data: {
        total: 3,
        chunks: [
          { role: "concept", startsUnit: true, unit: 1 },
          { role: "concept", startsUnit: true, unit: 2 },
          { role: "concept", startsUnit: true, unit: 3 },
        ],
      },
    });
    const second = (all as { data: { chunks: { id: number }[] } }).data.chunks[1]?.id as number;
    expect(
      await dispatch("material:setChunkLabel", { workspaceId, chunkId: second, role: "other" }),
    ).toMatchObject({ ok: true, data: { id: second, role: "other", unit: 2 } });
    expect(
      await dispatch("material:chunks", { workspaceId, materialId, role: "other" }),
    ).toMatchObject({ ok: true, data: { total: 1, chunks: [{ id: second }] } });
    expect(
      await dispatch("material:chunks", { workspaceId, materialId, role: "concept" }),
    ).toMatchObject({ ok: true, data: { total: 2, nextOffset: null } });
  });

  it("rejects an unknown role, an empty change and a material that was not analyzed", async () => {
    const { dispatch, workspaceId } = open();
    expect(
      await dispatch("material:setChunkLabel", { workspaceId, chunkId: 1, role: "x" } as never),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await dispatch("material:setChunkLabel", { workspaceId, chunkId: 1 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      await dispatch("material:setChunkLabel", { workspaceId, chunkId: 1, role: "other" }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "chunkId" }] },
    });
  });
});
