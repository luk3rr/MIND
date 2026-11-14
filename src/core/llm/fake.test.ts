/*
 * Filename: fake.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeProvider } from "./fake.js";

const Out = z.object({ n: z.number() });
const messages = [{ role: "user" as const, content: "x" }];

describe("FakeProvider", () => {
  it("returns the scripted constant and records the call", async () => {
    const fake = new FakeProvider();
    fake.script("Out", { n: 1 });
    const result = await fake.complete(messages, Out, { model: "m", schemaName: "Out" });
    expect(result.value).toEqual({ n: 1 });
    expect(fake.calls).toEqual([{ messages, schemaName: "Out", model: "m" }]);
  });

  it("passes messages and model to a handler", async () => {
    const fake = new FakeProvider();
    fake.script("Out", (sent: readonly { content: string }[], model: string) => ({
      n: sent[0]?.content.length ?? 0 + model.length,
    }));
    const result = await fake.complete(messages, Out, { model: "abc", schemaName: "Out" });
    expect(result.value.n).toBe(1);
  });

  it("fails for an unscripted schema and validates scripted answers", async () => {
    const fake = new FakeProvider();
    await expect(
      fake.complete(messages, Out, { model: "m", schemaName: "Out" }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    fake.script("Out", { n: "not a number" });
    await expect(fake.complete(messages, Out, { model: "m", schemaName: "Out" })).rejects.toThrow();
  });

  it("does not require consent and can delay the answer", async () => {
    const fake = new FakeProvider(undefined, 20);
    fake.script("Response", { n: 2 });
    const started = Date.now();
    await fake.complete(messages, Out, { model: "m" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
    expect(fake.requiresConsent).toBe(false);
  });
});
