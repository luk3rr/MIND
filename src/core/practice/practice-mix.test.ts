/*
 * Filename: practice-mix.test.ts
 * Created on: November 18, 2026
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

/** Four approved questions; topic A is created first, so its group comes before topic B. */
async function questions(topics: ("A" | "B")[]) {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  const opened = generationRig({ clock, tzOffset: () => 0 });
  rig = opened;
  const generation = opened.core.generation(opened.workspaceId);
  const run = generation.start({
    materialId: opened.materialId,
    subtype: "multiple_choice_4",
    quantity: 4,
    kind: "question",
  });
  await opened.core.queue.wait(opened.workspaceId, run.jobId as number);
  const review = opened.core.review(opened.workspaceId);
  const ids = review.list({ runId: run.id }).map((q) => q.id);
  for (const id of ids) {
    clock.advance(1000);
    review.review([id]);
  }
  const { sqlite } = opened.core.registry.open(opened.workspaceId).connection;
  const a = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('A')").run().lastInsertRowid);
  const b = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('B')").run().lastInsertRowid);
  ids.forEach((id, index) => {
    sqlite
      .prepare("UPDATE item SET topic_id = ? WHERE id = ?")
      .run(topics[index] === "A" ? a : b, id);
  });
  return { practice: opened.core.practice(opened.workspaceId), ids, a, b, sqlite };
}

const mix = (afterKey: string | null = null) => ({ by: "topic" as const, afterKey });
const order = (items: { item: { id: number } }[]): number[] => items.map((entry) => entry.item.id);

describe("mixed question queue (FR-14, FR-15)", () => {
  it("alternates the topics of the never-answered questions", async () => {
    const { practice, ids, a, b } = await questions(["A", "A", "A", "B"]);
    const queue = practice.queue(10, undefined, { mix: mix() });
    expect(order(queue)).toEqual([ids[0], ids[3], ids[1], ids[2]]);
    expect(queue.map((entry) => entry.mixKey)).toEqual([`t:${a}`, `t:${b}`, `t:${a}`, `t:${a}`]);
  });

  it("keeps the parts in order and rotates inside each of them", async () => {
    const { practice, ids } = await questions(["A", "A", "B", "A"]);
    practice.answer(ids[0] as number, "A");
    practice.answer(ids[1] as number, "B");
    // Plain: never answered (2, 3), then the wrong one (1). Mixed: the same parts, rotated.
    expect(order(practice.queue(10))).toEqual([ids[2], ids[3], ids[1]]);
    expect(order(practice.queue(10, undefined, { mix: mix() }))).toEqual([ids[3], ids[2], ids[1]]);
  });

  it("continues the rotation from the key of the question shown before", async () => {
    const { practice, ids, a, b } = await questions(["A", "A", "A", "B"]);
    expect(practice.nextQuestion(undefined, { mix: mix(`t:${a}`) })?.item.id).toBe(ids[3]);
    expect(practice.nextQuestion(undefined, { mix: mix(`t:${b}`) })?.item.id).toBe(ids[0]);
  });

  it("rotates across calls as questions are answered and excluded", async () => {
    const { practice, ids } = await questions(["A", "A", "A", "B"]);
    const shown: number[] = [];
    let afterKey: string | null = null;
    for (let step = 0; step < 4; step += 1) {
      const next = practice.nextQuestion(undefined, { mix: mix(afterKey), exclude: shown });
      shown.push(next?.item.id as number);
      afterKey = next?.mixKey ?? null;
    }
    expect(shown).toEqual([ids[0], ids[3], ids[1], ids[2]]);
  });

  it("leaves the queue as it was when the mix is off (NFR-2)", async () => {
    const { practice, ids } = await questions(["A", "A", "B", "A"]);
    const queue = practice.queue(10);
    expect(order(queue)).toEqual(ids);
    expect(queue.every((entry) => entry.mixKey === null)).toBe(true);
  });

  it("rotates by material and groups runs without material under none", async () => {
    const { practice, ids, sqlite } = await questions(["A", "A", "B", "A"]);
    expect(
      practice.queue(1, undefined, { mix: { by: "material", afterKey: null } })[0]?.mixKey,
    ).toMatch(/^m:\d+$/);
    sqlite.prepare("UPDATE generation_run SET material_id = NULL").run();
    const queue = practice.queue(2, undefined, { mix: { by: "material", afterKey: null } });
    expect(queue.map((entry) => entry.mixKey)).toEqual(["none", "none"]);
    expect(order(queue)).toEqual([ids[0], ids[1]]);
  });
});
