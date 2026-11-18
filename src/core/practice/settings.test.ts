/*
 * Filename: settings.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { meta } from "../db/workspace-schema.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { PRACTICE_DEFAULTS } from "./settings.js";
import type { PracticeSettings } from "./settings.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function settings(): { store: PracticeSettings; rig: GenerationRig } {
  rig = generationRig();
  return { store: rig.core.practiceSettings(rig.workspaceId), rig };
}

describe("PracticeSettings (FR-21)", () => {
  it("starts with the defaults that keep the earlier behaviour (C-9)", () => {
    const { store } = settings();
    expect(store.get()).toEqual({ feedback: "immediate", confidence: false, interleave: false });
    expect(store.defaults()).toEqual(PRACTICE_DEFAULTS);
  });

  it("saves only the fields it is given and keeps the rest", () => {
    const { store } = settings();
    expect(store.set({ feedback: "block" })).toEqual({
      feedback: "block",
      confidence: false,
      interleave: false,
    });
    expect(store.set({ confidence: true, interleave: true })).toEqual({
      feedback: "block",
      confidence: true,
      interleave: true,
    });
  });

  it("keeps the values after the workspace is reopened", async () => {
    const { store, rig: opened } = settings();
    store.set({ feedback: "next_day", interleave: true });
    const again = opened.core.practiceSettings(opened.workspaceId);
    expect(again.get()).toMatchObject({ feedback: "next_day", interleave: true });
  });

  it("refuses an invalid feedback mode and saves nothing from that request", () => {
    const { store } = settings();
    let error: unknown;
    try {
      store.set({ confidence: true, feedback: "tomorrow" as never });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("VALIDATION_ERROR");
    expect((error as AppError).fields?.map((f) => f.field)).toEqual(["feedback"]);
    expect(store.get().confidence).toBe(false);
  });

  it("refuses a value that is not on or off", () => {
    const { store } = settings();
    expect(() => store.set({ interleave: "yes" as never })).toThrowError(AppError);
  });

  it("falls back to the default when the stored value is unknown", () => {
    const { store, rig: opened } = settings();
    const { db } = opened.core.registry.open(opened.workspaceId).connection;
    db.insert(meta).values({ key: "practice.feedback", value: "later" }).run();
    expect(store.get().feedback).toBe("immediate");
  });

  it("resets to the defaults", () => {
    const { store } = settings();
    store.set({ feedback: "block", confidence: true, interleave: true });
    expect(store.reset()).toEqual(PRACTICE_DEFAULTS);
  });
});
