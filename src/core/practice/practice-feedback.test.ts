/*
 * Filename: practice-feedback.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { fixedClock } from "../test/helpers.js";
import { questionView } from "./service.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function approved(feedback?: "immediate" | "block") {
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
  if (feedback) opened.core.practiceSettings(opened.workspaceId).set({ feedback });
  const { sqlite } = opened.core.registry.open(opened.workspaceId).connection;
  const rows = () =>
    sqlite.prepare("SELECT id, release_at, seen_at FROM attempt ORDER BY id").all() as {
      id: number;
      release_at: string | null;
      seen_at: string | null;
    }[];
  return { practice: opened.core.practice(opened.workspaceId), ids, clock, rows };
}

describe("feedback timing of an answer (FR-7, FR-8, FR-11)", () => {
  it("shows the feedback with the answer by default, as before (NFR-2)", async () => {
    const { practice, ids, rows } = await approved();
    const result = practice.answer(ids[0] as number, "B");
    expect(result).toMatchObject({ correct: false, correctKey: "A", seen: true });
    expect(result.releaseAt).toBe("2026-03-10T15:00:03.000Z");
    expect(rows()).toEqual([
      { id: result.attemptId, release_at: result.releaseAt, seen_at: result.releaseAt },
    ]);
  });

  it("holds the feedback back in the block mode, but counts the answer at once", async () => {
    const { practice, ids, rows } = await approved("block");
    const result = practice.answer(ids[0] as number, "A");
    expect(result).toMatchObject({ correct: true, seen: false, releaseAt: null });
    expect(rows()).toEqual([{ id: result.attemptId, release_at: null, seen_at: null }]);
    expect(practice.counts()).toMatchObject({ answeredToday: 1, correctToday: 1 });
    expect(practice.question(ids[0] as number)).toMatchObject({ attempts: 1, lastCorrect: true });
  });

  it("gives the feedback of the answers in the order asked, with the source", async () => {
    const { practice, ids } = await approved("block");
    const first = practice.answer(ids[0] as number, "B");
    const second = practice.answer(ids[1] as number, "A");
    const entries = practice.feedback([second.attemptId, first.attemptId]);
    expect(entries.map((entry) => entry.attemptId)).toEqual([second.attemptId, first.attemptId]);
    expect(entries[1]).toMatchObject({
      itemId: ids[0],
      correct: false,
      answer: "B",
      correctKey: "A",
      confidence: null,
    });
    expect(entries[1]?.options).toHaveLength(4);
    expect(entries[1]?.options[0]?.why).toBeTruthy();
    expect(entries[1]?.sourceTitle).toBeTruthy();
    expect(entries[1]?.quote).toBeTruthy();
  });

  it("refuses an answer that does not exist", async () => {
    const { practice } = await approved("block");
    expect(() => practice.feedback([999])).toThrowError(AppError);
    expect(() => practice.releaseBlock([999])).toThrowError(/Resposta não encontrada/);
  });

  it("releases a block: the waiting answers become visible and seen, once", async () => {
    const { practice, ids, clock, rows } = await approved("block");
    const first = practice.answer(ids[0] as number, "B");
    const second = practice.answer(ids[1] as number, "A");
    clock.advance(60_000);
    const released = practice.releaseBlock([first.attemptId, second.attemptId]);
    expect(released.map((entry) => entry.correct)).toEqual([false, true]);
    const moment = clock.now().toISOString();
    expect(rows().map((row) => [row.release_at, row.seen_at])).toEqual([
      [moment, moment],
      [moment, moment],
    ]);
    clock.advance(60_000);
    practice.releaseBlock([first.attemptId]);
    expect(rows()[0]?.seen_at).toBe(moment);
  });

  it("shows only the question, without the key, the comment or the quote", async () => {
    const { practice, ids } = await approved();
    const view = questionView(practice.question(ids[0] as number).item);
    expect(Object.keys(view).sort()).toEqual(["id", "options", "statement", "subtype", "topic"]);
    expect(view.options).toHaveLength(4);
    expect(Object.keys(view.options[0] ?? {})).toEqual(["key", "text"]);
    expect(JSON.stringify(view)).not.toContain("alternativa A");
  });
});

describe("feedback of the next day and pending feedback (FR-9, FR-10)", () => {
  async function nextDay() {
    const { practice, ids, clock, rows } = await approved();
    rig?.core.practiceSettings(rig.workspaceId).set({ feedback: "next_day" });
    return { practice, ids, clock, rows };
  }

  it("waits for the turn of the study day: nothing at 3:59, ready at 4:00", async () => {
    const { practice, ids, clock } = await nextDay();
    clock.set("2026-03-10T22:00:00.000Z");
    const result = practice.answer(ids[0] as number, "B");
    expect(result).toMatchObject({ seen: false, releaseAt: "2026-03-11T04:00:00.000Z" });
    clock.set("2026-03-11T03:59:00.000Z");
    expect(practice.pendingCount()).toBe(0);
    expect(practice.openFeedback().entries).toEqual([]);
    clock.set("2026-03-11T04:00:00.000Z");
    expect(practice.pendingCount()).toBe(1);
  });

  it("opens the ready feedback oldest first and marks it as seen", async () => {
    const { practice, ids, clock } = await nextDay();
    clock.set("2026-03-10T22:00:00.000Z");
    const first = practice.answer(ids[0] as number, "B");
    clock.set("2026-03-10T22:05:00.000Z");
    const second = practice.answer(ids[1] as number, "A");
    clock.set("2026-03-11T05:00:00.000Z");
    const opened = practice.openFeedback();
    expect(opened.entries.map((entry) => entry.attemptId)).toEqual([
      first.attemptId,
      second.attemptId,
    ]);
    expect(opened.remaining).toBe(0);
    expect(practice.pendingCount()).toBe(0);
    expect(practice.openFeedback().entries).toEqual([]);
  });

  it("returns what did not fit in the limit as remaining", async () => {
    const { practice, ids, clock } = await nextDay();
    clock.set("2026-03-10T22:00:00.000Z");
    for (const id of ids) {
      practice.answer(id, "A");
      clock.advance(1000);
    }
    clock.set("2026-03-11T05:00:00.000Z");
    const opened = practice.openFeedback(2);
    expect(opened.entries).toHaveLength(2);
    expect(opened.remaining).toBe(1);
    expect(practice.openFeedback().entries).toHaveLength(1);
  });

  it("releases the answers of an abandoned block, keeping the next-day ones waiting", async () => {
    const { practice, ids, clock, rows } = await approved("block");
    practice.answer(ids[0] as number, "A");
    rig?.core.practiceSettings(rig.workspaceId).set({ feedback: "next_day" });
    clock.set("2026-03-10T22:00:00.000Z");
    practice.answer(ids[1] as number, "A");
    expect(practice.pendingCount()).toBe(0);
    expect(practice.releaseAbandoned()).toBe(1);
    expect(practice.pendingCount()).toBe(1);
    expect(rows().map((row) => row.release_at !== null)).toEqual([true, true]);
    expect(practice.releaseAbandoned()).toBe(0);
  });

  it("does not count an answer given and seen at once, and ignores a pre-test", async () => {
    const { practice, ids } = await approved();
    practice.answer(ids[0] as number, "A");
    expect(practice.pendingCount()).toBe(0);
  });
});
