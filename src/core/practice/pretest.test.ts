/*
 * Filename: pretest.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { fixedClock } from "../test/helpers.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function questions(quantity = 4) {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  const opened = generationRig({ clock, tzOffset: () => 0 });
  rig = opened;
  const run = opened.core.generation(opened.workspaceId).start({
    materialId: opened.materialId,
    subtype: "multiple_choice_4",
    quantity,
    kind: "question",
  });
  await opened.core.queue.wait(opened.workspaceId, run.jobId as number);
  const review = opened.core.review(opened.workspaceId);
  const ids = review.list({ runId: run.id }).map((q) => q.id);
  for (const id of ids) {
    clock.advance(1000);
    review.review([id]);
  }
  const ws = opened.workspaceId;
  return {
    pretest: opened.core.pretest(ws),
    practice: opened.core.practice(ws),
    core: opened.core,
    ws,
    materialId: opened.materialId,
    ids,
    sqlite: opened.core.registry.open(ws).connection.sqlite,
  };
}

describe("PretestService (FR-1, FR-2, FR-3, FR-5)", () => {
  it("offers the approved questions never answered in practice", async () => {
    const { pretest, practice, ids, materialId } = await questions();
    expect(pretest.eligible(materialId)).toEqual(ids);
    expect(pretest.eligibleCount(materialId)).toBe(4);
    practice.answer(ids[0] as number, "A");
    expect(pretest.eligible(materialId)).toEqual(ids.slice(1));
    expect(pretest.eligibleCount(999)).toBe(0);
  });

  it("starts a round of the asked size, without key, comment or quote", async () => {
    const { pretest, ids, materialId } = await questions();
    const round = pretest.start(materialId, 2);
    expect(round.questions.map((q) => q.id)).toEqual(ids.slice(0, 2));
    expect(round.available).toBe(4);
    expect(round.roundId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(round.questions[0] ?? {}).sort()).toEqual([
      "id",
      "options",
      "statement",
      "subtype",
      "topic",
    ]);
  });

  it("uses what is available when the student asks for more, and refuses 0 and 21", async () => {
    const { pretest, materialId } = await questions(3);
    expect(pretest.start(materialId, 20).questions).toHaveLength(3);
    for (const count of [0, 21, 1.5]) {
      expect(() => pretest.start(materialId, count)).toThrowError(AppError);
    }
  });

  it("refuses an unknown material and a material without eligible questions", async () => {
    const { pretest, practice, ids, materialId } = await questions(1);
    expect(() => pretest.start(999, 1)).toThrowError(/Não existe material/);
    practice.answer(ids[0] as number, "A");
    expect(() => pretest.start(materialId, 1)).toThrowError(/não tem questões/);
  });

  it("puts questions that were in no round before those that were", async () => {
    const { pretest, ids, materialId } = await questions();
    const first = pretest.start(materialId, 1);
    pretest.answer(first.roundId, ids[0] as number, "A");
    expect(pretest.start(materialId, 4).questions.map((q) => q.id)).toEqual([
      ids[1],
      ids[2],
      ids[3],
      ids[0],
    ]);
  });

  it("records an answer without telling the result, and summarises the round", async () => {
    const { pretest, ids, materialId } = await questions();
    const round = pretest.start(materialId, 2);
    expect(pretest.answer(round.roundId, ids[0] as number, "B", { seconds: 4 })).toBeUndefined();
    pretest.answer(round.roundId, ids[1] as number, "A");
    const summary = pretest.summary(round.roundId);
    expect(summary).toMatchObject({ total: 2, correct: 1 });
    expect(summary.entries[0]).toMatchObject({ correct: false, answer: "B", correctKey: "A" });
    expect(summary.entries[0]?.explanation).toBeTruthy();
    expect(() => pretest.summary("nothing")).toThrowError(/Rodada não encontrada/);
  });

  it("validates the answer and asks for the confidence when it is turned on", async () => {
    const { pretest, core, ws, ids, materialId } = await questions();
    const round = pretest.start(materialId, 1);
    expect(() => pretest.answer(round.roundId, ids[0] as number, "Z")).toThrowError(/alternativas/);
    expect(() => pretest.answer(round.roundId, 9999, "A")).toThrowError(/Não existe questão/);
    core.practiceSettings(ws).set({ confidence: true });
    expect(() => pretest.answer(round.roundId, ids[0] as number, "A")).toThrowError(/seguro/);
    pretest.answer(round.roundId, ids[0] as number, "A", { confidence: 3 });
    expect(pretest.summary(round.roundId).entries[0]?.confidence).toBe(3);
  });
});

describe("a pre-test never counts as practice (FR-4)", () => {
  it("leaves statistics, weak topics, the error notebook and the queue untouched", async () => {
    const { pretest, practice, core, ws, ids, materialId, sqlite } = await questions();
    const round = pretest.start(materialId, 4);
    for (const id of ids) pretest.answer(round.roundId, id, "B", { confidence: 3 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM attempt").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pretest_attempt").get()).toEqual({ n: 4 });
    expect(practice.counts()).toEqual({
      unseen: 4,
      retry: 0,
      answeredToday: 0,
      correctToday: 0,
      toPractice: 4,
    });
    expect(practice.queue(10).map((q) => q.item.id)).toEqual(ids);
    expect(practice.queue(10).every((q) => q.attempts === 0 && q.lastCorrect === null)).toBe(true);
    const stats = core.stats(ws);
    expect(stats.calibration().hasData).toBe(false);
    expect(stats.topicStats().every((topic) => topic.questionAttempts === 0)).toBe(true);
    expect(stats.weakestTopics()).toEqual([]);
    expect(core.notebook(ws).entries()).toEqual([]);
  });

  it("lists the rounds of a material, newest first, with their score", async () => {
    const { pretest, ids, materialId, core, ws } = await questions();
    expect(pretest.history(materialId)).toEqual([]);
    const first = pretest.start(materialId, 2);
    pretest.answer(first.roundId, ids[0] as number, "A");
    pretest.answer(first.roundId, ids[1] as number, "A");
    const second = pretest.start(materialId, 1);
    pretest.answer(second.roundId, ids[2] as number, "A");
    const rounds = pretest.history(materialId);
    expect(rounds.map((r) => r.roundId)).toEqual([second.roundId, first.roundId]);
    expect(rounds.map((r) => r.total)).toEqual([1, 2]);
    for (const round of rounds) {
      expect(round.correct).toBe(pretest.summary(round.roundId).correct);
    }
    expect(core.pretest(ws).history(999)).toEqual([]);
  });
});
