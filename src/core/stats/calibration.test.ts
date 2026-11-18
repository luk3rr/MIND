/*
 * Filename: calibration.test.ts
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

/** A workspace with two topics and a way to seed answers at a given confidence and day. */
function seeded() {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  const opened = generationRig({ clock, tzOffset: () => 0 });
  rig = opened;
  const { sqlite } = opened.core.registry.open(opened.workspaceId).connection;
  sqlite
    .prepare(
      "INSERT INTO generation_run (kind, subtype, model, requested, created_at) VALUES ('question','multiple_choice','m',1,'x')",
    )
    .run();
  const topicId = (name: string): number =>
    Number(sqlite.prepare("INSERT INTO topic (name) VALUES (?)").run(name).lastInsertRowid);
  const itemOf = (topic: number): number =>
    Number(
      sqlite
        .prepare(
          "INSERT INTO item (run_id, kind, subtype, payload_json, status, topic_id, created_at) VALUES (1,'question','multiple_choice','{}','approved',?, 'x')",
        )
        .run(topic).lastInsertRowid,
    );
  const answer = (
    item: number,
    confidence: number | null,
    correct: boolean,
    day = "2026-03-10",
  ): void => {
    sqlite
      .prepare(
        "INSERT INTO attempt (item_id, answer, correct, answered_at, day, confidence) VALUES (?,?,?,?,?,?)",
      )
      .run(item, "A", correct ? 1 : 0, `${day}T10:00:00.000Z`, day, confidence);
  };
  return {
    stats: opened.core.stats(opened.workspaceId),
    sqlite,
    topicId,
    itemOf,
    answer,
  };
}

/** `right` correct and `wrong` wrong answers at one level. */
function bulk(
  answer: ReturnType<typeof seeded>["answer"],
  item: number,
  level: number,
  right: number,
  wrong: number,
): void {
  for (let step = 0; step < right; step += 1) answer(item, level, true);
  for (let step = 0; step < wrong; step += 1) answer(item, level, false);
}

describe("StatsService.calibration (FR-19, FR-20)", () => {
  it("has no data before an answer with confidence", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    answer(itemOf(topicId("A")), null, true);
    const result = stats.calibration();
    expect(result.hasData).toBe(false);
    expect(result.levels.map((level) => level.answers)).toEqual([0, 0, 0]);
    expect(result.levels.every((level) => level.rate === null && level.flag === null)).toBe(true);
    expect(result.topics).toEqual([]);
  });

  it("counts answers and accuracy by level", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    const item = itemOf(topicId("A"));
    bulk(answer, item, 1, 1, 3);
    bulk(answer, item, 2, 4, 2);
    bulk(answer, item, 3, 5, 0);
    expect(stats.calibration().levels).toEqual([
      { level: 1, answers: 4, correct: 1, rate: 0.25, flag: null },
      { level: 2, answers: 6, correct: 4, rate: 4 / 6, flag: null },
      { level: 3, answers: 5, correct: 5, rate: 1, flag: null },
    ]);
  });

  it("flags 'certain' below 80% (79 is flagged, 80 is not)", () => {
    const first = seeded();
    bulk(first.answer, first.itemOf(first.topicId("A")), 3, 3, 1); // 75%, but only 4 answers
    expect(first.stats.calibration().levels[2]?.flag).toBeNull();
    bulk(first.answer, first.itemOf(first.topicId("B")), 3, 0, 1); // 3 of 5 = 60%
    expect(first.stats.calibration().levels[2]).toMatchObject({
      answers: 5,
      flag: "overconfident",
    });
  });

  it("does not flag 'certain' at exactly 80%", async () => {
    const { stats, itemOf, topicId, answer } = seeded();
    bulk(answer, itemOf(topicId("A")), 3, 4, 1);
    expect(stats.calibration().levels[2]).toMatchObject({ answers: 5, rate: 0.8, flag: null });
  });

  it("flags 'think so' below 60%, not at 60%, and never flags a guess", () => {
    const below = seeded();
    bulk(below.answer, below.itemOf(below.topicId("A")), 2, 2, 3);
    expect(below.stats.calibration().levels[1]).toMatchObject({ rate: 0.4, flag: "overconfident" });
    bulk(below.answer, below.itemOf(below.topicId("B")), 1, 0, 9);
    expect(below.stats.calibration().levels[0]).toMatchObject({ rate: 0, flag: null });
  });

  it("does not flag 'think so' at exactly 60%", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    bulk(answer, itemOf(topicId("A")), 2, 3, 2);
    expect(stats.calibration().levels[1]).toMatchObject({ rate: 0.6, flag: null });
  });

  it("needs at least five answers at a level before it flags", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    bulk(answer, itemOf(topicId("A")), 3, 0, 4);
    expect(stats.calibration().levels[2]).toMatchObject({ answers: 4, rate: 0, flag: null });
  });

  it("looks only at the study days of the window", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    const item = itemOf(topicId("A"));
    answer(item, 3, false, "2026-03-10");
    answer(item, 3, false, "2026-02-12"); // 26 days before: inside 30 days
    answer(item, 3, false, "2026-02-05"); // 33 days before: outside
    expect(stats.calibration(30).levels[2]?.answers).toBe(2);
    expect(stats.calibration(60).levels[2]?.answers).toBe(3);
    expect(stats.calibration(1).levels[2]?.answers).toBe(1);
  });

  it("lists the topics with the most wrong answers given with certainty", () => {
    const { stats, itemOf, topicId, answer } = seeded();
    const a = itemOf(topicId("Fotossíntese"));
    const b = itemOf(topicId("Genética"));
    const c = itemOf(topicId("Ecologia"));
    bulk(answer, a, 3, 0, 3);
    bulk(answer, b, 3, 2, 1);
    bulk(answer, c, 2, 0, 5); // not certain: does not count
    expect(stats.calibration().topics).toEqual([
      { topicId: expect.any(Number), name: "Fotossíntese", confidentWrong: 3 },
      { topicId: expect.any(Number), name: "Genética", confidentWrong: 1 },
    ]);
  });

  it("never counts the answers of a pre-test", () => {
    const { stats, sqlite, itemOf, topicId } = seeded();
    const item = itemOf(topicId("A"));
    for (let step = 0; step < 6; step += 1) {
      sqlite
        .prepare(
          "INSERT INTO pretest_attempt (item_id, round_id, answer, correct, confidence, answered_at, day) VALUES (?,?,?,?,?,?,?)",
        )
        .run(item, "round", "A", 0, 3, "2026-03-10T10:00:00.000Z", "2026-03-10");
    }
    const result = stats.calibration();
    expect(result.hasData).toBe(false);
    expect(result.topics).toEqual([]);
  });
});
