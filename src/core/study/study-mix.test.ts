/*
 * Filename: study-mix.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { studyRig } from "../test/study-fixture.js";
import type { StudyRig } from "../test/study-fixture.js";
import { Rating } from "./scheduler.js";

let rig: StudyRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

/** Six new cards: the first four on topic A and the last two on topic B. */
async function twoTopics(options: { newPerDay?: number } = {}) {
  rig = await studyRig(6, options);
  const { sqlite } = rig.core.registry.open(rig.workspaceId).connection;
  const a = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('A')").run().lastInsertRowid);
  const b = Number(sqlite.prepare("INSERT INTO topic (name) VALUES ('B')").run().lastInsertRowid);
  rig.itemIds.forEach((id, index) => {
    sqlite.prepare("UPDATE item SET topic_id = ? WHERE id = ?").run(index < 4 ? a : b, id);
  });
  return {
    study: rig.core.study(rig.workspaceId),
    a,
    b,
    ids: rig.itemIds,
    clock: rig.clock,
    sqlite,
  };
}

const mix = (afterKey: string | null = null) => ({ by: "topic" as const, afterKey });

describe("mixed card queue (FR-14, FR-15)", () => {
  it("alternates the topics of the new cards and keeps the order inside each topic", async () => {
    const { study, a, b, ids } = await twoTopics();
    const queue = study.queue(6, undefined, undefined, 0, false, mix());
    expect(queue.map((card) => card.item.id)).toEqual([
      ids[0],
      ids[4],
      ids[1],
      ids[5],
      ids[2],
      ids[3],
    ]);
    expect(queue.map((card) => card.mixKey)).toEqual([
      `t:${a}`,
      `t:${b}`,
      `t:${a}`,
      `t:${b}`,
      `t:${a}`,
      `t:${a}`,
    ]);
  });

  it("continues the rotation from the key of the card shown before", async () => {
    const { study, a, b, ids } = await twoTopics();
    expect(study.nextCard(undefined, undefined, 0, false, mix())?.item.id).toBe(ids[0]);
    expect(study.nextCard(undefined, undefined, 0, false, mix(`t:${a}`))?.item.id).toBe(ids[4]);
    expect(study.nextCard(undefined, undefined, 0, false, mix(`t:${b}`))?.item.id).toBe(ids[0]);
  });

  it("leaves the queue exactly as it was when the mix is off (NFR-2)", async () => {
    const { study, ids } = await twoTopics();
    const queue = study.queue(6);
    expect(queue.map((card) => card.item.id)).toEqual(ids);
    expect(queue.every((card) => card.mixKey === null)).toBe(true);
  });

  it("keeps the daily limit of new cards", async () => {
    const { study, ids } = await twoTopics({ newPerDay: 3 });
    const queue = study.queue(10, undefined, undefined, 0, false, mix());
    expect(queue.map((card) => card.item.id)).toEqual([ids[0], ids[4], ids[1]]);
  });

  it("serves a due learning card before the new ones, even with the mix on", async () => {
    const { study, ids, clock } = await twoTopics();
    study.rate(ids[3] as number, Rating.AGAIN);
    clock.advance(11 * 60_000);
    const queue = study.queue(3, undefined, undefined, 0, false, mix());
    expect(queue[0]?.item.id).toBe(ids[3]);
    expect(queue.slice(1).every((card) => card.schedule === null)).toBe(true);
  });

  it("rotates by material, with one group when all cards share a material", async () => {
    const { study, ids } = await twoTopics();
    const queue = study.queue(6, undefined, undefined, 0, false, {
      by: "material",
      afterKey: null,
    });
    expect(queue.map((card) => card.item.id)).toEqual(ids);
    expect(new Set(queue.map((card) => card.mixKey)).size).toBe(1);
    expect(queue[0]?.mixKey).toMatch(/^m:\d+$/);
  });

  it("groups cards of runs without a material under none when rotating by material", async () => {
    const { study, ids, sqlite } = await twoTopics();
    sqlite.prepare("UPDATE generation_run SET material_id = NULL").run();
    const queue = study.queue(2, undefined, undefined, 0, false, {
      by: "material",
      afterKey: null,
    });
    expect(queue.map((card) => card.mixKey)).toEqual(["none", "none"]);
    expect(queue.map((card) => card.item.id)).toEqual([ids[0], ids[1]]);
  });
});
