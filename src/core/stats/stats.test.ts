/*
 * Filename: stats.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  attempt,
  cardState,
  generationRun,
  item,
  material,
  reviewLog,
  topic,
} from "../db/workspace-schema.js";
import { MIN_EVENTS, streaks } from "./service.js";
import { BRT_OFFSET, NOON, TODAY, World, day } from "../test/world.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const stats = (w: World) => w.rig.core.stats(w.workspaceId);
const NOW = new Date(NOON);

describe("StatsService topic accuracy", () => {
  it("combines card ratings and question attempts", () => {
    const w = setup();
    const cells = w.topic("Células");
    w.reviews(w.item("card", cells), [3, 3, 2, 1]);
    w.attempts(w.item("question", cells), [true, false]);
    const [stat] = stats(w).topicStats();
    expect(stat).toMatchObject({
      name: "Células",
      cardReviews: 4,
      cardPasses: 3,
      questionAttempts: 2,
      questionCorrect: 1,
    });
    expect(stat?.accuracy).toBeCloseTo(4 / 6);
    expect([stat?.cardAccuracy, stat?.questionAccuracy]).toEqual([0.75, 0.5]);
    expect(stat?.smallSample).toBe(false);
    expect(stat?.events).toBeGreaterThanOrEqual(MIN_EVENTS);
  });

  it("counts the approved cards and questions of each topic, drafts left out", () => {
    const w = setup();
    const cells = w.topic("Células");
    w.item("card", cells);
    w.item("card", cells);
    w.item("question", cells);
    w.item("question", cells, { status: "draft" });
    expect(stats(w).topicStats()[0]).toMatchObject({ name: "Células", cards: 2, questions: 1 });
  });

  it("flags small samples, keeps idle topics and puts items without a topic last", () => {
    const w = setup();
    w.reviews(w.item("card", w.topic("Poucos")), [3]);
    w.topic("Sem itens");
    w.item("card", w.topic("Parado"));
    w.reviews(w.item("card", null), [1, 3]);
    const all = stats(w).topicStats();
    const byName = Object.fromEntries(all.map((s) => [String(s.name), s]));
    expect(byName["Poucos"]?.smallSample).toBe(true);
    expect([byName["Parado"]?.events, byName["Parado"]?.accuracy]).toEqual([0, null]);
    expect(byName["Sem itens"]).toMatchObject({
      cards: 0,
      questions: 0,
      events: 0,
      accuracy: null,
    });
    expect(byName["null"]).toMatchObject({ cardReviews: 2, topicId: null });
    expect(all.at(-1)?.name).toBeNull();
  });

  it("ignores drafts and discarded items", () => {
    const w = setup();
    const t = w.topic("Rascunhos");
    for (const status of ["draft", "discarded"]) w.reviews(w.item("card", t, { status }), [3, 3]);
    // The topic is still listed, but nothing of the drafts or discarded items counts.
    expect(stats(w).topicStats()).toMatchObject([
      { name: "Rascunhos", cards: 0, events: 0, accuracy: null },
    ]);
  });

  it("lists the weakest topics, needing enough events and ordered by accuracy", () => {
    const w = setup();
    for (const [name, ratings] of [
      ["Fraco", [1, 1, 3, 1, 1]],
      ["Médio", [3, 1, 3, 1, 3]],
      ["Forte", [3, 3, 3, 3, 3]],
    ] as const) {
      w.reviews(w.item("card", w.topic(name)), [...ratings]);
    }
    w.reviews(w.item("card", w.topic("Pouco")), [1]);
    const s = stats(w);
    expect(s.weakestTopics().map((t) => t.name)).toEqual(["Fraco", "Médio"]);
    expect(s.weakestTopics(1).map((t) => t.name)).toEqual(["Fraco"]);
    expect(s.weakestTopics(5, 1)).toHaveLength(3);
  });
});

describe("StatsService retention, activity and summary", () => {
  it("counts only reviews of cards already in review (state 2) inside the window", () => {
    const w = setup();
    const card = w.item("card", null);
    w.reviews(card, [3, 3, 1], TODAY, 2);
    w.reviews(card, [1], day(-1), 2);
    w.reviews(card, [1, 1], TODAY, 1);
    w.reviews(card, [1], TODAY, null);
    w.reviews(card, [3], day(-60), 2);
    const result = stats(w).retention(30, NOW);
    expect(result.days).toHaveLength(30);
    expect(result.days.at(-1)).toMatchObject({ day: TODAY, reviews: 3, passes: 2 });
    expect(result.days.at(-1)?.rate).toBeCloseTo(2 / 3);
    expect(result.days.at(-2)).toMatchObject({ reviews: 1, rate: 0 });
    expect(result.days[0]?.rate).toBeNull();
    expect(result.reviews).toBe(4);
    expect(result.rate).toBeCloseTo(0.5);
  });

  it("adds reviews and attempts per day", () => {
    const w = setup();
    w.reviews(w.item("card", null), [3, 3]);
    w.attempts(w.item("question", null), [true]);
    w.attempts(w.item("question", null), [false, false], day(-2));
    const days = stats(w).activity(7, NOW);
    expect(days.at(-1)?.day).toBe(TODAY);
    expect(days.filter((d) => d.total).map((d) => [d.reviews, d.attempts, d.total])).toEqual([
      [0, 2, 2],
      [2, 1, 3],
    ]);
  });

  it("reports today, the goal and the streaks", () => {
    const w = setup();
    const card = w.item("card", null);
    const question = w.item("question", null);
    for (const offset of [-3, -2, -1, 0]) w.reviews(card, [3], day(offset));
    w.attempts(question, [true, true]);
    w.reviews(card, [3], day(-10));
    w.reviews(card, [3], day(-9));
    expect(stats(w).summary(NOW)).toMatchObject({
      reviewedToday: 1,
      answeredToday: 2,
      activityToday: 3,
      goal: 40,
      goalMet: false,
      currentStreak: 4,
      longestStreak: 4,
      totalReviews: 6,
      totalAttempts: 2,
    });
  });

  it("uses the clock and the offset of the core when no moment is given", () => {
    const w = setup();
    w.reviews(w.item("card", null), [3]);
    expect(stats(w).summary().reviewedToday).toBe(1);
    expect(stats(w).retention(3).days.at(-1)?.day).toBe(TODAY);
    expect(stats(w).activity(3).at(-1)?.reviews).toBe(1);
    expect(BRT_OFFSET()).toBe(180);
  });
});

describe("streaks", () => {
  it("ignores a day that has not ended but breaks on a missed one", () => {
    expect(streaks(new Set(), "2026-11-14")).toEqual([0, 0]);
    expect(streaks(new Set(["2026-11-13", "2026-11-12"]), "2026-11-14")).toEqual([2, 2]);
    expect(streaks(new Set(["2026-11-11"]), "2026-11-14")).toEqual([0, 1]);
    expect(
      streaks(new Set(["2026-11-14", "2026-11-12", "2026-11-11", "2026-11-10"]), "2026-11-14"),
    ).toEqual([1, 3]);
  });
});

describe("golden values from the Python implementation", () => {
  interface Golden {
    topics: string[];
    items: [number, "card" | "question", number | null, string][];
    reviews: [number, number, number, number | null][];
    attempts: [number, boolean, number][];
    topicStats: Record<string, unknown>[];
    weakest: string[];
    retention: [string, number, number][];
    activity: [string, number, number][];
    summary: Record<string, number>;
  }
  const golden = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "stats.json"), "utf8"),
  ) as Golden;

  it("reproduces topic accuracy, weakest topics, retention, activity and the summary", () => {
    const w = setup();
    const topicIds = golden.topics.map((name) => w.topic(name));
    for (const [id, kind, topicIndex, status] of golden.items) {
      w.item(kind, topicIndex === null ? null : (topicIds[topicIndex] as number), { status, id });
    }
    for (const [itemId, rating, offset, state] of golden.reviews)
      w.reviews(itemId, [rating], day(offset), state);
    for (const [itemId, correct, offset] of golden.attempts)
      w.attempts(itemId, [correct], day(offset));
    const s = stats(w);
    expect(
      s.topicStats().map((t) => ({
        name: t.name,
        cardReviews: t.cardReviews,
        cardPasses: t.cardPasses,
        questionAttempts: t.questionAttempts,
        questionCorrect: t.questionCorrect,
        accuracy: t.accuracy,
        smallSample: t.smallSample,
      })),
    ).toEqual(golden.topicStats);
    // The app only lists topics under the weak line; the Python ranking listed them all.
    const accuracy = new Map(s.topicStats().map((t) => [t.name, t.accuracy]));
    expect(s.weakestTopics(5, 2).map((t) => t.name)).toEqual(
      golden.weakest.filter((name) => (accuracy.get(name) ?? 1) < 0.7),
    );
    expect(s.retention(30, NOW).days.map((d) => [d.day, d.reviews, d.passes])).toEqual(
      golden.retention,
    );
    expect(s.activity(30, NOW).map((d) => [d.day, d.reviews, d.attempts])).toEqual(golden.activity);
    const summary = s.summary(NOW);
    expect(summary).toMatchObject(golden.summary);
    expect(w.db.select().from(item).all()).toHaveLength(golden.items.length);
    expect(w.db.select().from(topic).all()).toHaveLength(golden.topics.length);
    expect(w.db.select().from(reviewLog).all()).toHaveLength(golden.reviews.length);
    expect(w.db.select().from(attempt).all()).toHaveLength(golden.attempts.length);
  });
});

describe("performance (NFR-3)", () => {
  it("builds the overview of 10 thousand records in under 300 ms", () => {
    const w = setup();
    const t = w.topic("Carga");
    const card = w.item("card", t);
    const question = w.item("question", t);
    w.db.transaction((tx) => {
      for (let i = 0; i < 5000; i += 1) {
        tx.insert(reviewLog)
          .values({
            itemId: card,
            rating: 3,
            day: day(-(i % 30)),
            previousStateJson: '{"state":2}',
            reviewedAt: NOON,
          })
          .run();
        tx.insert(attempt)
          .values({
            itemId: question,
            answer: "A",
            correct: i % 2 === 0,
            day: day(-(i % 30)),
            answeredAt: NOON,
          })
          .run();
      }
    });
    const s = stats(w);
    const started = performance.now();
    s.topicStats();
    s.retention(30, NOW);
    s.activity(30, NOW);
    s.summary(NOW);
    expect(performance.now() - started).toBeLessThan(300);
  });
});

describe("StatsService material progress", () => {
  const addMaterial = (w: World, title: string): number =>
    w.db
      .insert(material)
      .values({ title, kind: "pdf", filename: `${title}.pdf`, storedPath: "p" })
      .returning({ id: material.id })
      .get().id;
  const addItem = (
    w: World,
    materialId: number,
    kind: "card" | "question",
    status: string,
  ): number => {
    const runId = w.db
      .insert(generationRun)
      .values({ kind, subtype: "qa", model: "m", requested: 1, materialId })
      .returning({ id: generationRun.id })
      .get().id;
    return w.db
      .insert(item)
      .values({ runId, kind, subtype: "qa", payloadJson: "{}", status })
      .returning({ id: item.id })
      .get().id;
  };

  it("counts what was made, reviewed and studied per material and suggests the weakest", () => {
    const w = setup();
    const strong = addMaterial(w, "Anatomia");
    const weak = addMaterial(w, "Fisiologia");
    const idle = addMaterial(w, "Vazio");
    w.reviews(addItem(w, strong, "card", "approved"), [3, 3, 3, 3, 3]);
    addItem(w, strong, "question", "approved");
    addItem(w, strong, "card", "draft");
    addItem(w, strong, "card", "discarded");
    w.attempts(addItem(w, weak, "question", "approved"), [false, false, false, true, false, false]);
    const byTitle = Object.fromEntries(
      stats(w)
        .materialStats(NOW)
        .map((m) => [m.title, m]),
    );
    expect(byTitle["Anatomia"]).toMatchObject({
      created: 3,
      cards: 2,
      questions: 1,
      toReview: 1,
      approved: 2,
      discarded: 1,
      studied: 1,
      unseen: 1,
      accuracy: 1,
    });
    expect(byTitle["Fisiologia"]).toMatchObject({ studied: 1, unseen: 0, focus: "weak" });
    expect(byTitle["Fisiologia"]?.accuracy).toBeCloseTo(1 / 6);
    expect(byTitle["Vazio"]).toMatchObject({ created: 0, focus: null, suggested: false });
    expect(idle).toBeGreaterThan(0);
    const order = stats(w)
      .materialStats(NOW)
      .map((m) => [m.title, m.suggested]);
    expect(order[0]).toEqual(["Fisiologia", true]);
    expect(order.filter(([, s]) => s)).toHaveLength(1);
  });

  it("counts due cards and suggests reviewing when nothing is approved yet", () => {
    const w = setup();
    const due = addMaterial(w, "Com vencidos");
    const drafts = addMaterial(w, "So rascunhos");
    const card = addItem(w, due, "card", "approved");
    w.reviews(card, [3]);
    w.db
      .insert(cardState)
      .values({ itemId: card, fsrsJson: "{}", due: "2026-11-01T00:00:00.000Z", state: 2, reps: 1 })
      .run();
    addItem(w, drafts, "card", "draft");
    const [first, second] = stats(w).materialStats(NOW);
    expect(first).toMatchObject({ title: "Com vencidos", due: 1, focus: "due", suggested: true });
    expect(second).toMatchObject({ title: "So rascunhos", focus: "review", suggested: false });
  });

  it("suggests nothing when there is nothing to do", () => {
    const w = setup();
    addMaterial(w, "Vazio");
    expect(
      stats(w)
        .materialStats(NOW)
        .some((m) => m.suggested),
    ).toBe(false);
  });
});
