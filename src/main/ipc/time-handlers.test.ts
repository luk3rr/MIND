/*
 * Filename: time-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../../core/core.js";
import type { Core } from "../../core/core.js";
import { fixedClock, tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

describe("time channels", () => {
  it("runs the manual timer through the validated channels (FR-2)", async () => {
    const clock = fixedClock("2026-03-10T15:00:00.000Z");
    core = createCore({ dataDir: tempDir(), env: {}, clock, tzOffset: () => 0 });
    const workspaceId = core.registry.create("Tempo").id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(await dispatch("time:state", { workspaceId })).toMatchObject({
      ok: true,
      data: { status: "idle", goalMinutes: 60 },
    });
    expect(await dispatch("time:start", { workspaceId })).toMatchObject({
      data: { status: "running", mode: "manual" },
    });
    clock.advance(12_000);
    expect(await dispatch("time:pause", { workspaceId })).toMatchObject({
      data: { status: "paused", activeSeconds: 12 },
    });
    expect(await dispatch("time:resume", { workspaceId })).toMatchObject({
      data: { status: "running" },
    });
    expect(await dispatch("time:stop", { workspaceId })).toMatchObject({
      data: { status: "idle", todaySeconds: 12 },
    });
  });

  it("refuses invalid payloads and unknown topics", async () => {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Tempo").id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(await dispatch("time:start", { workspaceId, extra: 1 })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await dispatch("time:start", { workspaceId, topicId: 42 })).toMatchObject({
      ok: false,
      error: { code: "TOPIC_NOT_FOUND" },
    });
    expect(await dispatch("time:state", { workspaceId: 99 })).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
  });

  it("forgets the timer when its workspace is deleted", async () => {
    core = createCore({ dataDir: tempDir(), env: {} });
    const workspaceId = core.registry.create("Tempo").id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    await dispatch("time:start", { workspaceId });
    expect(await dispatch("workspace:delete", { id: workspaceId })).toEqual({ ok: true, data: {} });
  });
});

describe("time activity channels", () => {
  it("counts activity and pauses on blur through the validated channels (FR-3, FR-4)", async () => {
    const clock = fixedClock("2026-03-10T15:00:00.000Z");
    core = createCore({ dataDir: tempDir(), env: {}, clock, tzOffset: () => 0 });
    const workspaceId = core.registry.create("Tempo").id;
    const dispatch = createRouter(
      createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
      { error: () => undefined },
    );
    expect(await dispatch("time:activity", { workspaceId, source: "reading" })).toEqual({
      ok: true,
      data: {},
    });
    clock.advance(15_000);
    expect(await dispatch("time:state", { workspaceId })).toMatchObject({
      data: { status: "running", mode: "auto", source: "reading", activeSeconds: 15 },
    });
    expect(await dispatch("time:blur", { workspaceId })).toEqual({ ok: true, data: {} });
    expect(await dispatch("time:state", { workspaceId })).toMatchObject({
      data: { status: "paused", pausedReason: "blur" },
    });
    expect(await dispatch("time:activity", { workspaceId, source: "manual" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });
});
