/*
 * Filename: time.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import {
  generationRun,
  item,
  material,
  meta,
  studySession,
  topic,
} from "../db/workspace-schema.js";
import { fixedClock, tempDir } from "../test/helpers.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

function rig(start = "2026-03-10T15:00:00.000Z") {
  const clock = fixedClock(start);
  const events: number[] = [];
  core = createCore({
    dataDir: tempDir(),
    env: {},
    clock,
    tzOffset: () => 0,
    onTimeEvent: ({ workspaceId }) => events.push(workspaceId),
  });
  const workspaceId = core.registry.create("Tempo").id;
  const db = core.registry.open(workspaceId).connection.db;
  return { clock, workspaceId, events, db, time: core.time(workspaceId) };
}

describe("manual study timer (FR-1, FR-2, FR-6, FR-12)", () => {
  it("starts idle with the default goal and no time today", () => {
    const { time } = rig();
    expect(time.state()).toMatchObject({
      status: "idle",
      mode: null,
      activeSeconds: 0,
      todaySeconds: 0,
      goalMinutes: 60,
    });
  });

  it("does not count the paused time: 10 s, pause, 10 s idle, resume, 10 s, stop = 20 s", () => {
    const { time, clock, db } = rig();
    time.start();
    clock.advance(10_000);
    expect(time.state()).toMatchObject({ status: "running", activeSeconds: 10, todaySeconds: 10 });
    time.pause();
    clock.advance(10_000);
    expect(time.state()).toMatchObject({
      status: "paused",
      pausedReason: "manual",
      activeSeconds: 10,
    });
    time.resume();
    clock.advance(10_000);
    const stopped = time.stop();
    expect(stopped).toMatchObject({ status: "idle", activeSeconds: 0, todaySeconds: 20 });
    const rows = db.select().from(studySession).all();
    expect(rows.map((row) => row.seconds)).toEqual([10, 10]);
    expect(rows.every((row) => row.source === "manual" && row.day === "2026-03-10")).toBe(true);
  });

  it("is idempotent: start while active and pause/resume/stop out of order only report", () => {
    const { time, clock } = rig();
    expect(time.pause().status).toBe("idle");
    expect(time.resume().status).toBe("idle");
    expect(time.stop().status).toBe("idle");
    time.start();
    clock.advance(5_000);
    expect(time.start().activeSeconds).toBe(5);
    expect(time.resume().status).toBe("running");
  });

  it("stores the topic and rejects an unknown one", () => {
    const { time, db } = rig();
    expect(() => time.start(999)).toThrowError(
      expect.objectContaining({ code: "TOPIC_NOT_FOUND" }),
    );
    const topicId = db
      .insert(topic)
      .values({ name: "Álgebra" })
      .returning({ id: topic.id })
      .get().id;
    expect(time.start(topicId).topicId).toBe(topicId);
    time.stop();
    expect(db.select().from(studySession).get()?.topicId).toBe(topicId);
  });

  it("flush keeps the open interval current, so a crash loses at most the last interval (FR-6)", () => {
    const { time, clock, db } = rig();
    time.start();
    clock.advance(30_000);
    time.flush();
    clock.advance(20_000);
    // Simulates a crash: the process dies here, so only the flushed 30 s are stored.
    expect(db.select().from(studySession).get()?.seconds).toBe(30);
    expect(time.state().todaySeconds).toBe(50);
  });

  it("closes the interval on shutdown and when the core closes", async () => {
    const { time, clock, db, workspaceId } = rig();
    time.start();
    clock.advance(7_000);
    core?.releaseTime(workspaceId);
    expect(db.select().from(studySession).get()?.seconds).toBe(7);
    expect(core?.time(workspaceId)).not.toBe(time);
    const again = core?.time(workspaceId);
    again?.start();
    clock.advance(3_000);
    await core?.close();
    core = undefined;
  });

  it("splits the interval when the study day turns over (FR-12)", () => {
    const { time, clock, db } = rig("2026-03-11T03:59:30.000Z");
    time.start();
    clock.advance(60_000);
    time.flush();
    clock.advance(10_000);
    time.stop();
    const rows = db.select().from(studySession).all();
    expect(rows.map((row) => [row.day, row.seconds])).toEqual([
      ["2026-03-10", 60],
      ["2026-03-11", 10],
    ]);
    expect(time.state().todaySeconds).toBe(10);
  });

  it("emits a change event for each state change and never logs", () => {
    const { time, events, workspaceId } = rig();
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    time.start();
    time.pause();
    time.resume();
    time.stop();
    expect(events).toEqual([workspaceId, workspaceId, workspaceId, workspaceId]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reads the daily goal from the workspace settings", () => {
    const { time, db } = rig();
    db.insert(meta).values({ key: "time.dailyGoalMin", value: "0" }).run();
    expect(time.goalMinutes()).toBe(0);
  });
});

function seedItem(db: ReturnType<typeof rig>["db"], topicId: number | null): number {
  const runId = db
    .insert(generationRun)
    .values({ kind: "card", subtype: "qa", model: "m", requested: 1 })
    .returning({ id: generationRun.id })
    .get().id;
  return db
    .insert(item)
    .values({ runId, kind: "card", subtype: "qa", payloadJson: "{}", topicId })
    .returning({ id: item.id })
    .get().id;
}

describe("automatic counting (FR-3, FR-4, FR-5, FR-13)", () => {
  it("opens an interval on activity and keeps it while the user interacts", () => {
    const { time, clock, db } = rig();
    time.activity("cards");
    clock.advance(30_000);
    time.activity("cards");
    clock.advance(30_000);
    expect(time.state()).toMatchObject({
      status: "running",
      mode: "auto",
      source: "cards",
      activeSeconds: 60,
      todaySeconds: 60,
      bySource: { cards: 60, practice: 0, reading: 0, manual: 0 },
    });
    expect(db.select().from(studySession).all()).toHaveLength(1);
  });

  it("ends the interval at the last interaction, not after the idle limit (FR-4)", () => {
    const { time, clock, db } = rig();
    time.activity("cards");
    clock.advance(100_000);
    time.activity("cards");
    clock.advance(130_000);
    expect(time.state()).toMatchObject({
      status: "paused",
      pausedReason: "idle",
      activeSeconds: 100,
      todaySeconds: 100,
    });
    expect(db.select().from(studySession).get()?.seconds).toBe(100);
    time.activity("cards");
    clock.advance(20_000);
    expect(time.state()).toMatchObject({
      status: "running",
      activeSeconds: 120,
      todaySeconds: 120,
    });
  });

  it("pauses when the window loses focus and resumes on the next interaction", () => {
    const { time, clock } = rig();
    time.activity("reading");
    clock.advance(40_000);
    time.blur();
    expect(time.state()).toMatchObject({
      status: "paused",
      pausedReason: "blur",
      activeSeconds: 40,
    });
    clock.advance(60_000);
    time.activity("reading");
    clock.advance(10_000);
    expect(time.state()).toMatchObject({ status: "running", activeSeconds: 50, todaySeconds: 50 });
  });

  it("detects the idle limit by itself on the timer tick", () => {
    const { time, clock, events, workspaceId } = rig();
    time.activity("practice");
    clock.advance(200_000);
    time.tick();
    expect(time.state().status).toBe("paused");
    expect(events.filter((id) => id === workspaceId).length).toBeGreaterThanOrEqual(2);
  });

  it("moves to another interval when the source changes and labels the topic of the item (FR-13)", () => {
    const { time, clock, db } = rig();
    const topicId = db
      .insert(topic)
      .values({ name: "Álgebra" })
      .returning({ id: topic.id })
      .get().id;
    const itemId = seedItem(db, topicId);
    time.activity("cards", { itemId });
    clock.advance(10_000);
    time.activity("practice", { itemId });
    clock.advance(10_000);
    time.activity("reading", { materialId: 999 });
    clock.advance(10_000);
    time.stop();
    const rows = db.select().from(studySession).all();
    expect(rows.map((row) => [row.source, row.seconds, row.topicId, row.materialId])).toEqual([
      ["cards", 10, topicId, null],
      ["practice", 10, topicId, null],
      ["reading", 10, null, null],
    ]);
  });

  it("attributes reading to the material and never to a topic", () => {
    const { time, clock, db } = rig();
    const materialId = db
      .insert(material)
      .values({ title: "t", kind: "pdf", filename: "f.pdf", storedPath: "p" })
      .returning({ id: material.id })
      .get().id;
    time.activity("reading", { materialId });
    clock.advance(5_000);
    time.stop();
    expect(db.select().from(studySession).get()).toMatchObject({ materialId, topicId: null });
  });

  it("counts once when the manual timer runs and ignores activity while it is paused by hand (FR-5)", () => {
    const { time, clock, db } = rig();
    time.start();
    clock.advance(10_000);
    time.activity("cards");
    clock.advance(10_000);
    time.pause();
    clock.advance(10_000);
    time.activity("cards");
    clock.advance(10_000);
    expect(time.state()).toMatchObject({ status: "paused", mode: "manual", todaySeconds: 20 });
    time.stop();
    const rows = db.select().from(studySession).all();
    expect(rows.reduce((sum, row) => sum + row.seconds, 0)).toBe(20);
    expect(rows.every((row) => row.source === "manual")).toBe(true);
  });

  it("does not count when automatic counting is turned off", () => {
    const { time, clock, db } = rig();
    db.insert(meta).values({ key: "time.autoEnabled", value: "0" }).run();
    time.activity("cards");
    clock.advance(10_000);
    expect(time.state()).toMatchObject({ status: "idle", todaySeconds: 0 });
  });

  it("honors a custom idle limit and starts a new session after a long pause", () => {
    const { time, clock, db } = rig();
    db.insert(meta).values({ key: "time.idleSeconds", value: "30" }).run();
    expect(time.idleSeconds()).toBe(30);
    time.activity("cards");
    clock.advance(40_000);
    expect(time.state()).toMatchObject({ status: "paused", activeSeconds: 0 });
    clock.advance(11 * 60_000);
    expect(time.state().status).toBe("idle");
    time.activity("cards");
    expect(time.state()).toMatchObject({ status: "running", activeSeconds: 0 });
  });

  it("pausing an automatic session reports it as paused by focus and resume continues it", () => {
    const { time, clock } = rig();
    time.activity("cards");
    clock.advance(10_000);
    expect(time.pause()).toMatchObject({
      status: "paused",
      pausedReason: "blur",
      activeSeconds: 10,
    });
    expect(time.resume()).toMatchObject({ status: "running", source: "cards" });
    clock.advance(5_000);
    expect(time.stop().todaySeconds).toBe(15);
  });

  it("closes an automatic interval at its last interaction on shutdown", () => {
    const { time, clock, db } = rig();
    time.activity("cards");
    clock.advance(20_000);
    time.activity("cards");
    clock.advance(50_000);
    time.shutdown();
    expect(db.select().from(studySession).get()?.seconds).toBe(20);
  });
});

describe("two reader windows (FR-5)", () => {
  it("counts reading of the same material once when two windows report activity", () => {
    const { time, clock, db } = rig();
    const materialId = db
      .insert(material)
      .values({ title: "t", kind: "pdf", filename: "f.pdf", storedPath: "p" })
      .returning({ id: material.id })
      .get().id;
    for (let second = 0; second < 40; second += 4) {
      time.activity("reading", { materialId });
      clock.advance(2_000);
      time.activity("reading", { materialId });
      clock.advance(2_000);
    }
    time.stop();
    const rows = db.select().from(studySession).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seconds).toBe(40);
  });
});
