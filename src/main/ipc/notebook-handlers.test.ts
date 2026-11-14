/*
 * Filename: notebook-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { World } from "../../core/test/world.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

function dispatcher(w: World) {
  return createRouter(
    createHandlers(w.rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
}

describe("errors, topics and stats channels", () => {
  it("turns a missed question into a card and lists it (FR-15)", async () => {
    const w = (world = new World());
    const topic = w.topic("Células");
    const question = w.item("question", topic, {
      subtype: "certo_errado",
      payload: {
        statement: "O núcleo respira?",
        options: [],
        answer: "E",
        explanation: "Quem respira é a mitocôndria.",
      },
    });
    const dispatch = dispatcher(w);
    const workspaceId = w.workspaceId;
    expect(await dispatch("errors:makeCard", { workspaceId, questionId: question })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    w.attempts(question, [false]);
    const made = await dispatch("errors:makeCard", { workspaceId, questionId: question });
    expect(made).toMatchObject({ ok: true, data: { created: true } });
    expect(await dispatch("errors:makeCard", { workspaceId, questionId: question })).toMatchObject({
      data: { created: false },
    });
    expect(await dispatch("errors:list", { workspaceId })).toMatchObject({
      ok: true,
      data: {
        entries: [{ front: "O núcleo respira?", topic: "Células", fromQuestion: true }],
        counts: { total: 1, fromQuestions: 1, failedCards: 0 },
        topics: [{ name: "Células", cards: 1, questions: 1 }],
      },
    });
    expect(await dispatch("errors:list", { workspaceId, topicId: 999 })).toMatchObject({
      data: { entries: [] },
    });
  });

  it("renames, merges and deletes topics with field errors", async () => {
    const w = (world = new World());
    const first = w.topic("Celula");
    const second = w.topic("Células");
    const dispatch = dispatcher(w);
    const workspaceId = w.workspaceId;
    expect(
      await dispatch("topics:rename", { workspaceId, topicId: first, name: " " }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "name" }] },
    });
    expect(
      await dispatch("topics:rename", { workspaceId, topicId: first, name: "Biologia" }),
    ).toMatchObject({
      data: { name: "Biologia" },
    });
    expect(
      await dispatch("topics:merge", { workspaceId, sourceId: first, targetId: second }),
    ).toMatchObject({ ok: true, data: { name: "Células" } });
    expect(await dispatch("topics:delete", { workspaceId, topicId: second })).toEqual({
      ok: true,
      data: {},
    });
    expect(await dispatch("topics:delete", { workspaceId, topicId: second })).toMatchObject({
      ok: false,
      error: { code: "TOPIC_NOT_FOUND" },
    });
    expect(await dispatch("topics:list", { workspaceId })).toEqual({
      ok: true,
      data: { topics: [] },
    });
  });

  it("serves the statistics overview (FR-16)", async () => {
    const w = (world = new World());
    const topic = w.topic("Células");
    w.reviews(w.item("card", topic), [3, 3, 1, 3, 3], "2026-11-14", 2);
    w.attempts(w.item("question", topic), [true, false]);
    const result = await dispatcher(w)("stats:overview", { workspaceId: w.workspaceId });
    expect(result).toMatchObject({
      ok: true,
      data: {
        summary: { reviewedToday: 5, answeredToday: 2, goal: 40, goalMet: false },
        topics: [{ name: "Células", events: 7, smallSample: false }],
        weakest: [{ name: "Células" }],
        retention: { reviews: 5 },
      },
    });
    const data = (result as { data: { retention: { days: unknown[] }; activity: unknown[] } }).data;
    expect(data.retention.days).toHaveLength(30);
    expect(data.activity).toHaveLength(30);
  });
});
