/*
 * Filename: service.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { DEFAULTS } from "./service.js";
import { llmFixture } from "../test/llm-fixture.js";

let fixture: ReturnType<typeof llmFixture>;
afterEach(() => fixture.connection.close());

describe("SettingsService", () => {
  it("returns the defaults before anything is saved", () => {
    fixture = llmFixture();
    expect(fixture.settings.get()).toEqual({
      provider: "openrouter",
      generationModel: DEFAULTS.generation_model,
      judgeModel: DEFAULTS.judge_model,
      monthlyLimitUsd: 5,
    });
    expect(fixture.settings.keyConfigured()).toBe(false);
  });

  it("persists updates", () => {
    fixture = llmFixture();
    fixture.settings.update({ generationModel: " a/b-1 ", monthlyLimitUsd: 12.5 });
    expect(fixture.settings.get()).toMatchObject({
      generationModel: "a/b-1",
      judgeModel: DEFAULTS.judge_model,
      monthlyLimitUsd: 12.5,
    });
  });

  it("rejects invalid values naming the field and writes nothing", () => {
    fixture = llmFixture();
    let error: unknown;
    try {
      fixture.settings.update({ generationModel: "bad model!", monthlyLimitUsd: 0, provider: "x" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).fields?.map((f) => f.field).sort()).toEqual([
      "generationModel",
      "monthlyLimitUsd",
      "provider",
    ]);
    expect(fixture.settings.get().generationModel).toBe(DEFAULTS.generation_model);
    for (const limit of [-1, Number.NaN, 10_001]) {
      expect(() => fixture.settings.update({ monthlyLimitUsd: limit })).toThrowError(AppError);
    }
  });

  it("never contains the API key", () => {
    fixture = llmFixture();
    fixture.secrets.save("sk-or-v1-secret");
    expect(fixture.settings.keyConfigured()).toBe(true);
    expect(JSON.stringify(fixture.settings.get())).not.toContain("secret");
  });
});
