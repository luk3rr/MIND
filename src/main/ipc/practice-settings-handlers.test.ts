/*
 * Filename: practice-settings-handlers.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { studyRig } from "../../core/test/study-fixture.js";
import type { StudyRig } from "../../core/test/study-fixture.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let rig: StudyRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function dispatcher() {
  rig = await studyRig(1);
  const dispatch = createRouter(
    createHandlers(rig.core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
  return { dispatch, workspaceId: rig.workspaceId };
}

describe("practice settings channels (FR-21, NFR-7)", () => {
  it("reports the defaults and saves the options of one workspace", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    const defaults = { feedback: "immediate", confidence: false, interleave: false };
    expect(await dispatch("practice:settings", { workspaceId })).toEqual({
      ok: true,
      data: { settings: defaults, defaults },
    });
    expect(
      await dispatch("practice:saveSettings", { workspaceId, feedback: "block", confidence: true }),
    ).toEqual({ ok: true, data: { feedback: "block", confidence: true, interleave: false } });
    expect(await dispatch("practice:settings", { workspaceId })).toMatchObject({
      ok: true,
      data: { settings: { feedback: "block", confidence: true }, defaults },
    });
  });

  it("rejects a feedback mode that does not exist, before it reaches the core", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    const result = await dispatch("practice:saveSettings", { workspaceId, feedback: "never" });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await dispatch("practice:settings", { workspaceId })).toMatchObject({
      data: { settings: { feedback: "immediate" } },
    });
  });

  it("rejects unknown fields", async () => {
    const { dispatch, workspaceId } = await dispatcher();
    const result = await dispatch("practice:saveSettings", { workspaceId, mix: true });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
