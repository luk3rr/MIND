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
  return { dispatch, workspaceId: opened.workspaceId, ids, core: opened.core, clock };
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

describe("pending feedback channels (FR-9, FR-10)", () => {
  async function answeredNextDay() {
    const setup = await dispatcher();
    const { dispatch, workspaceId, ids, clock } = setup;
    await dispatch("practice:saveSettings", { workspaceId, feedback: "next_day" });
    clock.set("2026-03-10T22:00:00.000Z");
    const first = await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "B" });
    expect(first).toMatchObject({
      ok: true,
      data: { feedback: null, releaseAt: "2026-03-11T04:00:00.000Z" },
    });
    await dispatch("practice:answer", { workspaceId, itemId: ids[1], answer: "A" });
    return setup;
  }

  it("counts the ready feedback in Today and in the pending count, after the turn of the day", async () => {
    const { dispatch, workspaceId, clock } = await answeredNextDay();
    expect(await dispatch("practice:pendingCount", { workspaceId })).toEqual({
      ok: true,
      data: { count: 0 },
    });
    clock.set("2026-03-11T05:00:00.000Z");
    expect(await dispatch("practice:pendingCount", { workspaceId })).toEqual({
      ok: true,
      data: { count: 2 },
    });
    expect(await dispatch("today:summary", { workspaceId })).toMatchObject({
      ok: true,
      data: { pendingFeedback: 2 },
    });
  });

  it("opens the feedback once and marks it as seen", async () => {
    const { dispatch, workspaceId, clock } = await answeredNextDay();
    clock.set("2026-03-11T05:00:00.000Z");
    const opened = await dispatch("practice:openFeedback", { workspaceId });
    expect(opened).toMatchObject({
      ok: true,
      data: {
        entries: [
          { answer: "B", correct: false },
          { answer: "A", correct: true },
        ],
        remaining: 0,
      },
    });
    expect(await dispatch("practice:pendingCount", { workspaceId })).toMatchObject({
      data: { count: 0 },
    });
    expect(await dispatch("practice:openFeedback", { workspaceId })).toMatchObject({
      data: { entries: [] },
    });
  });

  it("limits what it opens and reports the rest", async () => {
    const { dispatch, workspaceId, clock } = await answeredNextDay();
    clock.set("2026-03-11T05:00:00.000Z");
    expect(await dispatch("practice:openFeedback", { workspaceId, limit: 1 })).toMatchObject({
      ok: true,
      data: { remaining: 1 },
    });
    for (const limit of [0, 201]) {
      expect(await dispatch("practice:openFeedback", { workspaceId, limit })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });

  it("releases the answers of an abandoned block", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    await dispatch("practice:saveSettings", { workspaceId, feedback: "block" });
    await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "A" });
    expect(await dispatch("practice:releaseAbandoned", { workspaceId })).toEqual({
      ok: true,
      data: { released: 1 },
    });
    expect(await dispatch("practice:pendingCount", { workspaceId })).toMatchObject({
      data: { count: 1 },
    });
  });
});

describe("confidence and calibration channels (FR-16, FR-17, FR-19)", () => {
  it("asks for the confidence once the question is on, with the field at fault", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    await dispatch("practice:saveSettings", { workspaceId, confidence: true });
    const missing = await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "A" });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "confidence" }] },
    });
    const given = await dispatch("practice:answer", {
      workspaceId,
      itemId: ids[0],
      answer: "B",
      confidence: 3,
    });
    expect(given).toMatchObject({
      ok: true,
      data: { feedback: { confidence: 3, correct: false } },
    });
  });

  it("rejects a confidence outside 1 to 3", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    for (const confidence of [0, 4, 1.5]) {
      expect(
        await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "A", confidence }),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("reports confidence against accuracy by level", async () => {
    const { dispatch, workspaceId, ids } = await dispatcher();
    const empty = await dispatch("stats:calibration", { workspaceId });
    expect(empty).toMatchObject({ ok: true, data: { hasData: false, topics: [] } });
    await dispatch("practice:answer", { workspaceId, itemId: ids[0], answer: "A", confidence: 3 });
    await dispatch("practice:answer", { workspaceId, itemId: ids[1], answer: "B", confidence: 1 });
    const result = await dispatch("stats:calibration", { workspaceId, days: 30 });
    expect(result).toMatchObject({
      ok: true,
      data: {
        hasData: true,
        levels: [
          { level: 1, answers: 1, correct: 0 },
          { level: 2, answers: 0 },
          { level: 3, answers: 1, correct: 1, rate: 1 },
        ],
      },
    });
  });

  it("rejects a window that is not 1 to 365 days", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    for (const days of [0, 366, 2.5]) {
      expect(await dispatch("stats:calibration", { workspaceId, days })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
    }
  });
});

describe("pre-test channels (FR-1..FR-5)", () => {
  async function pretestSetup() {
    const setup = await dispatcher();
    const { dispatch, workspaceId } = setup;
    const list = (await dispatch("material:list", { workspaceId })) as {
      data: { materials: { id: number; pretestEligible: number }[] };
    };
    return { ...setup, materialId: list.data.materials[0]?.id as number, list };
  }

  it("counts the eligible questions of each material on the list", async () => {
    const { list } = await pretestSetup();
    expect(list.data.materials[0]?.pretestEligible).toBe(3);
  });

  it("starts a round without the key and records answers without telling the result", async () => {
    const { dispatch, workspaceId, materialId } = await pretestSetup();
    const started = (await dispatch("pretest:start", { workspaceId, materialId, count: 2 })) as {
      ok: true;
      data: { roundId: string; questions: { id: number }[] };
    };
    expect(started.ok).toBe(true);
    expect(JSON.stringify(started)).not.toContain('"why"');
    const { roundId, questions } = started.data;
    const reply = await dispatch("pretest:answer", {
      workspaceId,
      roundId,
      itemId: questions[0]?.id,
      answer: "B",
    });
    expect(reply).toEqual({ ok: true, data: {} });
    expect(await dispatch("pretest:summary", { workspaceId, roundId })).toMatchObject({
      ok: true,
      data: { total: 1, correct: 0, entries: [{ answer: "B", correctKey: "A" }] },
    });
    expect(await dispatch("practice:counts", { workspaceId })).toMatchObject({
      data: { answeredToday: 0, unseen: 3 },
    });
  });

  it("refuses bad counts, unknown materials and unknown rounds", async () => {
    const { dispatch, workspaceId, materialId } = await pretestSetup();
    expect(await dispatch("pretest:start", { workspaceId, materialId, count: 0 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      await dispatch("pretest:start", { workspaceId, materialId: 999, count: 1 }),
    ).toMatchObject({
      ok: false,
      error: { code: "MATERIAL_NOT_FOUND" },
    });
    expect(await dispatch("pretest:summary", { workspaceId, roundId: "none" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
