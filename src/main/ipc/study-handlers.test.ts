/*
 * Filename: study-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { studyRig } from "../../core/test/study-fixture.js";
import type { StudyRig } from "../../core/test/study-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: StudyRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

describe("algorithm settings", () => {
  it("saves the algorithm settings, rejects bad ones and reports the defaults", async () => {
    rig = await studyRig(1);
    const dispatch = createRouter(
      createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    const workspaceId = rig.workspaceId;
    expect(
      await dispatch("study:saveSettings", {
        workspaceId,
        desiredRetention: 0.85,
        maximumInterval: 180,
        learningSteps: "2m, 20m",
        relearningSteps: "",
        enableFuzz: false,
      }),
    ).toMatchObject({
      ok: true,
      data: {
        desiredRetention: 0.85,
        maximumInterval: 180,
        learningSteps: "2m 20m",
        relearningSteps: "",
        enableFuzz: false,
      },
    });
    const today = await dispatch("study:today", { workspaceId });
    expect(today).toMatchObject({
      ok: true,
      data: {
        settings: { maximumInterval: 180, learningSteps: "2m 20m", enableFuzz: false },
        defaults: {
          desiredRetention: 0.9,
          maximumInterval: 36500,
          learningSteps: "1m 10m",
          relearningSteps: "10m",
          enableFuzz: true,
        },
      },
    });
    const bad = await dispatch("study:saveSettings", {
      workspaceId,
      maximumInterval: 0,
      learningSteps: "1x 10m",
      relearningSteps: "1m 2m 3m 4m 5m 6m",
    });
    expect(bad).toMatchObject({ ok: false });
    const fields = (bad as { error: { fields: { field: string }[] } }).error.fields.map(
      (entry) => entry.field,
    );
    expect(fields.sort()).toEqual(["learningSteps", "maximumInterval", "relearningSteps"]);
  });
});

describe("study channels", () => {
  it("serves the next card with its sides and interval previews, rates and undoes (FR-12, FR-13)", async () => {
    rig = await studyRig(3);
    const dispatch = createRouter(
      createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    const workspaceId = rig.workspaceId;
    expect(await dispatch("study:today", { workspaceId })).toMatchObject({
      ok: true,
      data: {
        counts: { newAvailable: 3, toStudy: 3 },
        settings: { newPerDay: 20, dailyGoal: 40 },
        facets: { cards: 3 },
      },
    });
    const next = await dispatch("study:next", { workspaceId });
    expect(next).toMatchObject({
      ok: true,
      data: {
        card: { isNew: true, subtype: "qa", previews: { "1": expect.stringMatching(/min/) } },
      },
    });
    const card = (next as { data: { card: { itemId: number; front: { text: string }[] } } }).data
      .card;
    expect(card.front[0]?.text).toContain("O que o trecho");
    expect(
      await dispatch("study:rate", {
        workspaceId,
        itemId: card.itemId,
        rating: 3,
        durationMs: 1500,
      }),
    ).toEqual({ ok: true, data: {} });
    expect(await dispatch("study:today", { workspaceId })).toMatchObject({
      data: { counts: { reviewedToday: 1 } },
    });
    expect(await dispatch("study:undo", { workspaceId })).toEqual({
      ok: true,
      data: { itemId: card.itemId },
    });
    expect(await dispatch("study:undo", { workspaceId })).toEqual({
      ok: true,
      data: { itemId: null },
    });
    expect(
      await dispatch("study:rate", { workspaceId, itemId: card.itemId, rating: 5 }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("saves study settings with field errors and filters the queue", async () => {
    rig = await studyRig(2);
    const dispatch = createRouter(
      createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    const workspaceId = rig.workspaceId;
    expect(
      await dispatch("study:saveSettings", { workspaceId, newPerDay: 1, dailyGoal: 5 }),
    ).toMatchObject({
      ok: true,
      data: { newPerDay: 1, dailyGoal: 5, desiredRetention: 0.9 },
    });
    expect(await dispatch("study:saveSettings", { workspaceId, newPerDay: 9999 })).toMatchObject({
      ok: false,
      error: { fields: [{ field: "newPerDay" }] },
    });
    expect(
      await dispatch("study:today", { workspaceId, filter: { subtype: "cloze" } }),
    ).toMatchObject({ data: { counts: { toStudy: 0 } } });
    expect(
      await dispatch("study:next", { workspaceId, filter: { subtype: "cloze" } }),
    ).toMatchObject({ data: { card: null } });
  });
});

describe("practice channels", () => {
  it("serves a question, grades the answer and counts (FR-14)", async () => {
    rig = await studyRig(1);
    const workspaceId = rig.workspaceId;
    const generation = rig.core.generation(workspaceId);
    const run = generation.start({
      materialId: rig.materialId,
      subtype: "multiple_choice_4",
      quantity: 2,
      kind: "question",
    });
    await rig.core.queue.wait(workspaceId, run.jobId as number);
    const ids = rig.core
      .review(workspaceId)
      .list({ runId: run.id })
      .map((q) => q.id);
    rig.core.review(workspaceId).review(ids);
    const dispatch = createRouter(
      createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    const next = await dispatch("practice:next", { workspaceId });
    expect(next).toMatchObject({
      ok: true,
      data: {
        question: { attempts: 0, lastCorrect: null, item: { statement: expect.any(String) } },
        counts: { unseen: 2 },
      },
    });
    const itemId = (next as { data: { question: { item: { id: number } } } }).data.question.item.id;
    expect(
      await dispatch("practice:answer", { workspaceId, itemId, answer: "A", seconds: 8 }),
    ).toMatchObject({
      ok: true,
      data: { feedback: { correct: true, correctKey: "A" } },
    });
    expect(await dispatch("practice:answer", { workspaceId, itemId, answer: "Z" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("practice:counts", { workspaceId })).toEqual({
      ok: true,
      data: { unseen: 1, retry: 0, answeredToday: 1, correctToday: 1, toPractice: 1 },
    });
    expect(await dispatch("practice:next", { workspaceId, exclude: ids })).toMatchObject({
      data: { question: null },
    });
  });
});
