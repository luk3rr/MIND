/*
 * Filename: practices.integration.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { fixedClock } from "../test/helpers.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

/** Questions written straight into the workspace: no provider, no network. */
function seeded(topics: number[]) {
  const clock = fixedClock("2026-03-10T22:00:00.000Z");
  const opened = generationRig({ clock, tzOffset: () => 0 });
  rig = opened;
  const ws = opened.workspaceId;
  const { sqlite } = opened.core.registry.open(ws).connection;
  sqlite
    .prepare(
      "INSERT INTO generation_run (kind, subtype, material_id, model, requested, created_at) VALUES ('question','multiple_choice',?,'-',1,'x')",
    )
    .run(opened.materialId);
  const payload = JSON.stringify({
    statement: "Pergunta?",
    explanation: "Porque sim.",
    answer: "A",
    options: [
      { key: "A", text: "Certa", why: "Sim." },
      { key: "B", text: "Errada", why: "Não." },
    ],
  });
  const topicIds = [...new Set(topics)].map((name) =>
    Number(sqlite.prepare("INSERT INTO topic (name) VALUES (?)").run(`T${name}`).lastInsertRowid),
  );
  const ids = topics.map((topic, index) =>
    Number(
      sqlite
        .prepare(
          "INSERT INTO item (run_id, kind, subtype, payload_json, status, topic_id, source_title, quote, approved_at, created_at) VALUES (1,'question','multiple_choice',?,'approved',?,'fonte','citação',?, 'x')",
        )
        .run(
          payload,
          topicIds[[...new Set(topics)].indexOf(topic)],
          `2026-03-10T10:0${index}:00.000Z`,
        ).lastInsertRowid,
    ),
  );
  return { core: opened.core, ws, ids, clock, materialId: opened.materialId, sqlite };
}

describe("the practices together (NFR-2, US-2, US-4, US-5)", () => {
  it("mixes topics, asks for the confidence and holds the feedback to the end of the block", () => {
    const { core, ws, ids } = seeded([1, 1, 2]);
    core.practiceSettings(ws).set({ feedback: "block", confidence: true, interleave: true });
    const practice = core.practice(ws);
    const order: number[] = [];
    let after: string | null = null;
    for (let step = 0; step < 3; step += 1) {
      const next = practice.nextQuestion(undefined, {
        exclude: order,
        mix: { by: "topic", afterKey: after },
      });
      order.push(next?.item.id as number);
      after = next?.mixKey ?? null;
    }
    expect(order).toEqual([ids[0], ids[2], ids[1]]);
    const given = order.map((id) => practice.answer(id, "B", { confidence: 3 }));
    expect(given.every((result) => !result.seen && result.releaseAt === null)).toBe(true);
    const released = practice.releaseBlock(given.map((result) => result.attemptId));
    expect(released.map((entry) => [entry.correct, entry.confidence])).toEqual([
      [false, 3],
      [false, 3],
      [false, 3],
    ]);
    const calibration = core.stats(ws).calibration();
    expect(calibration.levels[2]).toMatchObject({ answers: 3, correct: 0 });
    expect(calibration.topics.map((topic) => topic.confidentWrong)).toEqual([2, 1]);
  });

  it("keeps a pre-test with the block setting out of practice and in its own summary", () => {
    const { core, ws, ids, materialId } = seeded([1, 2]);
    core.practiceSettings(ws).set({ feedback: "block", confidence: true });
    const pretest = core.pretest(ws);
    const round = pretest.start(materialId, 2);
    for (const question of round.questions) {
      expect(pretest.answer(round.roundId, question.id, "A", { confidence: 1 })).toBeUndefined();
    }
    expect(pretest.summary(round.roundId)).toMatchObject({ total: 2, correct: 2 });
    expect(core.practice(ws).counts()).toMatchObject({ unseen: 2, answeredToday: 0 });
    expect(core.stats(ws).calibration().hasData).toBe(false);
    expect(core.practice(ws).pendingCount()).toBe(0);
    expect(ids).toHaveLength(2);
  });

  it("releases the next-day feedback after the day turns, with the other options on", () => {
    const { core, ws, ids, clock } = seeded([1, 2]);
    core.practiceSettings(ws).set({ feedback: "next_day", confidence: true, interleave: true });
    const practice = core.practice(ws);
    practice.answer(ids[0] as number, "A", { confidence: 2 });
    clock.set("2026-03-11T04:00:00.000Z");
    expect(practice.pendingCount()).toBe(1);
    expect(practice.openFeedback().entries[0]).toMatchObject({ correct: true, confidence: 2 });
  });
});

describe("without a provider or the network (FR-22, NFR-6)", () => {
  it("never reaches for the network or the model in the code of the four practices", () => {
    const files = [
      ...readdirSync(__dirname)
        .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
        .map((name) => join(__dirname, name)),
      join(__dirname, "..", "study", "interleave.ts"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\bfetch\(|https?:\/\/|node:https?|node:net|\bllm\b/i);
    }
  });
});
