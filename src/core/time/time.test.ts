/*
 * Filename: time.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { studySession, topic } from "../db/workspace-schema.js";
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

  it("reads the daily goal from the workspace settings", async () => {
    const { time, db } = rig();
    const { meta } = await import("../db/workspace-schema.js");
    db.insert(meta).values({ key: "time.dailyGoalMin", value: "0" }).run();
    expect(time.goalMinutes()).toBe(0);
  });
});
