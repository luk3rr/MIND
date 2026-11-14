/*
 * Filename: generation-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../../core/test/generation-fixture.js";
import type { GenerationRig } from "../../core/test/generation-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function dispatcher() {
  rig = generationRig();
  const routes = { lastRoute: null as string | null };
  const dispatch = createRouter(
    createHandlers(rig.core, routes, { pickFiles: () => Promise.resolve([]) }),
    {
      error: () => undefined,
    },
  );
  return { dispatch, workspaceId: rig.workspaceId, materialId: rig.materialId, core: rig.core };
}

describe("generation and review channels", () => {
  it("estimates, starts, lists and reviews a run end to end", async () => {
    const { dispatch, workspaceId, materialId, core } = dispatcher();
    const request = { workspaceId, materialId, subtype: "qa", quantity: 4, kind: "card" };
    expect(await dispatch("generation:estimate", request)).toMatchObject({
      ok: true,
      data: { chunks: 3, batches: 1 },
    });
    const started = await dispatch("generation:start", request);
    expect(started).toMatchObject({ ok: true, data: { status: "queued", requested: 4 } });
    const run = (started as { data: { id: number; jobId: number } }).data;
    await core.queue.wait(workspaceId, run.jobId);

    expect(await dispatch("generation:get", { workspaceId, runId: run.id })).toMatchObject({
      ok: true,
      data: { status: "done", generated: 4, progress: null },
    });
    expect(await dispatch("generation:list", { workspaceId })).toMatchObject({
      data: { runs: [{ id: run.id }] },
    });

    const listed = await dispatch("review:list", { workspaceId, runId: run.id, status: "draft" });
    expect(listed).toMatchObject({
      ok: true,
      data: { counts: { draft: 4, approved: 0, discarded: 0 } },
    });
    const items = (listed as { data: { items: { id: number; chunkId: number }[] } }).data.items;
    const detail = await dispatch("review:get", { workspaceId, itemId: items[0]?.id });
    expect(detail).toMatchObject({
      ok: true,
      data: { sourceText: expect.stringContaining("fotossíntese") },
    });

    expect(
      await dispatch("review:edit", {
        workspaceId,
        itemId: items[0]?.id,
        front: "Editada?",
        back: "Sim",
        topic: "T",
      }),
    ).toMatchObject({
      ok: true,
      data: { front: "Editada?", edited: true, topic: "T" },
    });
    expect(
      await dispatch("review:edit", {
        workspaceId,
        itemId: items[0]?.id,
        front: " ",
        back: "x",
        topic: null,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "front" }] },
    });
    expect(
      await dispatch("review:approve", { workspaceId, ids: [items[0]?.id, items[1]?.id] }),
    ).toEqual({
      ok: true,
      data: { approved: 2, discarded: 0, skipped: 0 },
    });
    expect(await dispatch("review:discard", { workspaceId, ids: [items[2]?.id] })).toMatchObject({
      data: { discarded: 1 },
    });
    expect(await dispatch("review:approveAll", { workspaceId, runId: run.id })).toMatchObject({
      data: { approved: 1 },
    });
  });

  it("rejects invalid requests with field errors and unknown runs with a stable code", async () => {
    const { dispatch, workspaceId, materialId } = dispatcher();
    expect(
      await dispatch("generation:start", {
        workspaceId,
        materialId,
        subtype: "qa",
        quantity: 4,
        kind: "question",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      await dispatch("generation:start", {
        workspaceId,
        materialId: 999,
        subtype: "qa",
        quantity: 4,
        kind: "card",
      }),
    ).toMatchObject({ ok: false, error: { code: "MATERIAL_NOT_FOUND" } });
    expect(await dispatch("generation:get", { workspaceId, runId: 99 })).toMatchObject({
      ok: false,
      error: { code: "RUN_NOT_FOUND" },
    });
    expect(await dispatch("generation:cancel", { workspaceId, runId: 99 })).toMatchObject({
      ok: false,
      error: { code: "RUN_NOT_FOUND" },
    });
  });
});
