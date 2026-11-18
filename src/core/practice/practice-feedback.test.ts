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
