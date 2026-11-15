/*
 * Filename: time-stats.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { generationRun, item, material, studySession, topic } from "../db/workspace-schema.js";
import { fixedClock, tempDir } from "../test/helpers.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

function rig() {
  const clock = fixedClock("2026-03-10T15:00:00.000Z");
  core = createCore({ dataDir: tempDir(), env: {}, clock, tzOffset: () => 0 });
  const workspaceId = core.registry.create("Estatísticas").id;
  const db = core.registry.open(workspaceId).connection.db;
  const time = core.time(workspaceId);
  const algebra = db.insert(topic).values({ name: "Álgebra" }).returning({ id: topic.id }).get().id;
  const logic = db.insert(topic).values({ name: "Lógica" }).returning({ id: topic.id }).get().id;
  const book = db
    .insert(material)
    .values({ title: "Livro", kind: "pdf", filename: "l.pdf", storedPath: "p" })
    .returning({ id: material.id })
    .get().id;
  const add = (
    day: string,
    source: "cards" | "practice" | "reading" | "manual",
    seconds: number,
    extra: { topicId?: number; materialId?: number } = {},
  ): void => {
    db.insert(studySession)
      .values({
        startedAt: `${day}T10:00:00.000Z`,
        endedAt: `${day}T10:00:00.000Z`,
        seconds,
        source,
        day,
        topicId: extra.topicId ?? null,
        materialId: extra.materialId ?? null,
      })
      .run();
  };
  return { time, db, add, algebra, logic, book, workspaceId, clock };
}

describe("daily goal and settings (FR-9)", () => {
  it("defaults, saves and validates the settings", () => {
    const { time } = rig();
    expect(time.settings()).toEqual({ dailyGoalMin: 60, idleSeconds: 120, autoEnabled: true });
    expect(time.saveSettings({ dailyGoalMin: 90, autoEnabled: false })).toEqual({
      dailyGoalMin: 90,
      idleSeconds: 120,
      autoEnabled: false,
    });
    expect(time.state().goalMinutes).toBe(90);
    expect(time.saveSettings({ dailyGoalMin: 0 }).dailyGoalMin).toBe(0);
    expect(() => time.saveSettings({ dailyGoalMin: 601, idleSeconds: 10 })).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [
          { field: "dailyGoalMin", message: expect.any(String) },
          { field: "idleSeconds", message: expect.any(String) },
        ],
      }),
    );
    expect(time.settings().dailyGoalMin).toBe(0);
  });
});

describe("time statistics (FR-10)", () => {
  it("totals exactly by day, source, topic and material", () => {
    const { time, add, algebra, logic, book } = rig();
    add("2026-03-10", "cards", 600, { topicId: algebra });
    add("2026-03-10", "practice", 300, { topicId: logic });
    add("2026-03-09", "reading", 1200, { materialId: book });
    add("2026-03-09", "manual", 100);
    add("2026-03-04", "cards", 999, { topicId: algebra });
    add("2026-02-20", "cards", 5000, { topicId: algebra });
    const seven = time.stats(7);
    expect(seven.byDay.map((entry) => entry.day)).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    expect(seven.totalSeconds).toBe(600 + 300 + 1200 + 100 + 999);
    expect(seven.avgPerDaySeconds).toBe(Math.round(3199 / 7));
    expect(seven.bestDay).toEqual({ day: "2026-03-09", seconds: 1300 });
    expect(seven.byDay[5]).toMatchObject({ reading: 1200, manual: 100, cards: 0 });
    expect(seven.byTopic).toEqual([
      { topicId: algebra, name: "Álgebra", seconds: 1599 },
      { topicId: null, name: null, seconds: 1300 },
      { topicId: logic, name: "Lógica", seconds: 300 },
    ]);
    expect(seven.byMaterial).toEqual([{ materialId: book, title: "Livro", seconds: 1200 }]);
    expect(time.stats(30).totalSeconds).toBe(3199 + 5000);
  });

  it("returns an empty period with zero days and no best day", () => {
    const { time } = rig();
    const stats = time.stats(7);
    expect(stats).toMatchObject({ totalSeconds: 0, avgPerDaySeconds: 0, bestDay: null });
    expect(stats.byDay).toHaveLength(7);
    expect(stats.byTopic).toEqual([]);
  });

  it("includes the interval that is still open", () => {
    const { time, clock } = rig();
    time.start();
    clock.advance(90_000);
    expect(time.stats(7).totalSeconds).toBe(90);
  });
});

describe("session history (FR-14)", () => {
  it("lists newest first with names and deletes a closed interval", () => {
    const { time, add, algebra, book } = rig();
    add("2026-03-10", "cards", 60, { topicId: algebra });
    add("2026-03-10", "reading", 30, { materialId: book });
    const [latest, older] = time.sessions();
    expect(latest).toMatchObject({ source: "reading", materialTitle: "Livro", topicName: null });
    expect(older).toMatchObject({ source: "cards", topicName: "Álgebra", materialTitle: null });
    expect(time.sessions(1)).toHaveLength(1);
    time.deleteSession(older?.id ?? 0);
    expect(time.sessions()).toHaveLength(1);
    expect(time.state().todaySeconds).toBe(30);
  });

  it("refuses unknown intervals and the one that is open", () => {
    const { time } = rig();
    expect(() => time.deleteSession(99)).toThrowError(
      expect.objectContaining({ code: "SESSION_NOT_FOUND" }),
    );
    time.start();
    const open = time.sessions()[0]?.id ?? 0;
    expect(() => time.deleteSession(open)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });
});

describe("items keep working with a topic (smoke)", () => {
  it("lets a deleted topic leave its intervals without a topic", () => {
    const { time, db, add, algebra } = rig();
    const runId = db
      .insert(generationRun)
      .values({ kind: "card", subtype: "qa", model: "m", requested: 1 })
      .returning({ id: generationRun.id })
      .get().id;
    db.insert(item).values({ runId, kind: "card", subtype: "qa", payloadJson: "{}" }).run();
    add("2026-03-10", "cards", 60, { topicId: algebra });
    db.delete(topic).run();
    expect(time.sessions()[0]?.topicName).toBeNull();
  });
});
