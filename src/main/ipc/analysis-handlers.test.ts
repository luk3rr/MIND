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
