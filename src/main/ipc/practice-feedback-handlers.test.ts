/*
 * Filename: practice-feedback-handlers.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../../core/test/generation-fixture.js";
import type { GenerationRig } from "../../core/test/generation-fixture.js";
import { fixedClock } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function dispatcher() {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  const opened = generationRig({ clock, tzOffset: () => 0 });
  rig = opened;
  const run = opened.core.generation(opened.workspaceId).start({
    materialId: opened.materialId,
    subtype: "multiple_choice_4",
    quantity: 3,
    kind: "question",
  });
  await opened.core.queue.wait(opened.workspaceId, run.jobId as number);
  const review = opened.core.review(opened.workspaceId);
  const ids = review.list({ runId: run.id }).map((q) => q.id);
  for (const id of ids) {
    clock.advance(1000);
    review.review([id]);
  }
  const dispatch = createRouter(
    createHandlers(opened.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
  return { dispatch, workspaceId: opened.workspaceId, ids, core: opened.core };
}

describe("practice channels with delayed feedback (FR-7, FR-8, NFR-7)", () => {
  it("sends the question without the key, the comments or the quote (ADR-5)", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    const result = await dispatch("practice:next", { workspaceId });
    expect(result).toMatchObject({ ok: true });
    const text = JSON.stringify(result);
    expect(text).not.toContain('"answer"');
    expect(text).not.toContain('"why"');
    expect(text).not.toContain('"quote"');
    expect(text).not.toContain('"explanation"');
    expect(text).not.toContain('"back"');
    const { question } = (result as { data: { question: { item: object } | null } }).data;
    expect(Object.keys(question?.item ?? {}).sort()).toEqual([
      "id",
      "options",
      "statement",
      "subtype",
      "topic",
    ]);
  });

  it("returns the feedback with the answer in the immediate mode", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    const result = await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "B" });
    expect(result).toMatchObject({
      ok: true,
      data: {
        feedback: { correct: false, answer: "B", correctKey: "A", itemId: ids[0] },
        releaseAt: expect.any(String),
      },
    });
  });

  it("returns no feedback in the block mode, then gives it when the block is released", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    await dispatch("practice:saveSettings", { workspaceId, feedback: "block" });
    const first = await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "B" });
    const second = await dispatch("practice:answer", { workspaceId, itemId: ids[1], answer: "A" });
    expect(first).toMatchObject({ ok: true, data: { feedback: null, releaseAt: null } });
    expect(JSON.stringify(first)).not.toContain("correctKey");
    const attemptIds = [first, second].map(
      (r) => (r as { data: { attemptId: number } }).data.attemptId,
    );
    const released = await dispatch("practice:releaseBlock", { workspaceId, attemptIds });
    expect(released).toMatchObject({
      ok: true,
      data: {
        entries: [
          { correct: false, answer: "B" },
          { correct: true, answer: "A" },
        ],
      },
    });
  });

  it("refuses to release an answer that does not exist and unknown fields", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    expect(
      await dispatch("practice:releaseBlock", { workspaceId, attemptIds: [999] }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await dispatch("practice:releaseBlock", { workspaceId, attemptIds: [] })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      await dispatch("practice:releaseBlock", { workspaceId, attemptIds: [1], extra: true }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("counts a waiting answer in the statistics right away (FR-11)", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    await dispatch("practice:saveSettings", { workspaceId, feedback: "block" });
    await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "A" });
    expect(await dispatch("practice:counts", { workspaceId })).toMatchObject({
      ok: true,
      data: { answeredToday: 1, correctToday: 1 },
    });
  });
});
