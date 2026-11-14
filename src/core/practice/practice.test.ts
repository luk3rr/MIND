/*
 * Filename: practice.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { fixedClock } from "../test/helpers.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function approved(profile = "multiple_choice_4", quantity = 4) {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  rig = generationRig({ clock, tzOffset: () => 0 });
  const generation = rig.core.generation(rig.workspaceId);
  const run = generation.start({
    materialId: rig.materialId,
    subtype: profile,
    quantity,
    kind: "question",
  });
  await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
  const review = rig.core.review(rig.workspaceId);
  const ids = review.list({ runId: run.id }).map((q) => q.id);
  for (const id of ids) {
    clock.advance(1000);
    review.review([id]);
  }
  return { practice: rig.core.practice(rig.workspaceId), ids, clock };
}

describe("PracticeService (FR-14)", () => {
  it("serves never-answered questions first, then wrong ones, then (with redo) right ones", async () => {
    const { practice, ids } = await approved();
    expect(practice.queue(10).map((q) => q.item.id)).toEqual(ids);
    practice.answer(ids[0] as number, "A");
    practice.answer(ids[1] as number, "B");
    expect(practice.queue(10).map((q) => q.item.id)).toEqual([ids[2], ids[3], ids[1]]);
    expect(practice.queue(10, undefined, { redo: true }).map((q) => q.item.id)).toEqual([
      ids[2],
      ids[3],
      ids[1],
      ids[0],
    ]);
    expect(
      practice.queue(10, undefined, { exclude: [ids[2] as number] }).map((q) => q.item.id),
    ).toEqual([ids[3], ids[1]]);
    expect(practice.nextQuestion()?.item.id).toBe(ids[2]);
    expect(practice.nextQuestion(undefined, { exclude: ids })?.item.id).toBeUndefined();
  });

  it("records the attempt with result, time and study day, and returns the correction", async () => {
    const { practice, ids } = await approved();
    const result = practice.answer(ids[0] as number, "B", { seconds: 12.5 });
    expect(result).toMatchObject({
      correct: false,
      answer: "B",
      correctKey: "A",
      attemptId: expect.any(Number),
    });
    expect(result.explanation).toContain("alternativa A");
    expect(result.options).toHaveLength(4);
    const row = rig?.core.registry
      .open(rig.workspaceId)
      .connection.sqlite.prepare("SELECT * FROM attempt")
      .get() as { correct: number; seconds: number; day: string; answer: string };
    expect(row).toMatchObject({ correct: 0, seconds: 12.5, day: "2026-03-10", answer: "B" });
    expect(practice.question(ids[0] as number)).toMatchObject({ attempts: 1, lastCorrect: false });
  });

  it("counts unseen, retry and the day's answers", async () => {
    const { practice, ids } = await approved();
    practice.answer(ids[0] as number, "A");
    practice.answer(ids[1] as number, "C");
    expect(practice.counts()).toEqual({
      unseen: 2,
      retry: 1,
      answeredToday: 2,
      correctToday: 1,
      toPractice: 3,
    });
  });

  it("accepts C and E for certo/errado questions", async () => {
    const { practice, ids } = await approved("certo_errado", 2);
    expect(practice.answer(ids[0] as number, "C").correct).toBe(true);
    expect(practice.answer(ids[1] as number, "E").correct).toBe(false);
    expect(() => practice.answer(ids[0] as number, "A")).toThrowError(
      /Escolha uma das alternativas/,
    );
  });

  it("rejects unknown items, cards and unapproved questions", async () => {
    const { practice } = await approved("certo_errado", 1);
    expect(() => practice.answer(9999, "C")).toThrowError(/Não existe questão/);
    expect(() => practice.question(9999)).toThrowError(/Não existe item/);
    const generation = rig?.core.generation(rig.workspaceId);
    const run = generation?.start({
      materialId: rig?.materialId as number,
      subtype: "multiple_choice_4",
      quantity: 1,
      kind: "question",
    });
    await rig?.core.queue.wait(rig.workspaceId, run?.jobId as number);
    const draft = rig?.core.review(rig.workspaceId).list({ runId: run?.id as number })[0];
    expect(() => practice.answer(draft?.id as number, "A")).toThrowError(/Só questões aprovadas/);
    const cards = generation?.start({
      materialId: rig?.materialId as number,
      subtype: "qa",
      quantity: 1,
      kind: "card",
    });
    await rig?.core.queue.wait(rig.workspaceId, cards?.jobId as number);
    const card = rig?.core.review(rig.workspaceId).list({ runId: cards?.id as number })[0];
    expect(() => practice.question(card?.id as number)).toThrowError(/Não existe questão/);
  });

  it("filters by material and ignores cards", async () => {
    const { practice } = await approved();
    expect(practice.queue(10, { materialId: rig?.materialId as number })).toHaveLength(4);
    expect(practice.queue(10, { materialId: 999 })).toHaveLength(0);
    expect(practice.counts({ subtype: "certo_errado" }).unseen).toBe(0);
  });
});
