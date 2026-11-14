/*
 * Filename: guarded.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { llmFixture, Card } from "../test/llm-fixture.js";

let fixture: ReturnType<typeof llmFixture>;
afterEach(() => fixture.connection.close());

const messages = [{ role: "user" as const, content: "hi" }];
const options = { model: "m/x", schemaName: "Card" };

describe("GuardedProvider and consent", () => {
  it("sends nothing without consent (FR-20, NFR-6)", async () => {
    fixture = llmFixture();
    await expect(fixture.guarded.complete(messages, Card, options)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect(fixture.inner.calls).toHaveLength(0);
  });

  it("lets the call through with consent and records the cost", async () => {
    fixture = llmFixture();
    fixture.consent.give("openrouter");
    const result = await fixture.guarded.complete(messages, Card, { ...options, purpose: "chat" });
    expect(result.value).toEqual({ front: "Q", back: "A" });
    expect(fixture.inner.calls).toHaveLength(1);
    expect(fixture.ledger.monthLines(2026, 3)).toMatchObject([{ purpose: "chat", model: "m/x" }]);
    expect(result.usage.costUsd).toBe(0);
  });

  it("returns the recorded cost in the usage", async () => {
    fixture = llmFixture();
    fixture.consent.give("openrouter");
    fixture.inner.script("Card", { front: "Q", back: "A" });
    const guarded = fixture.guarded;
    const first = await guarded.complete(messages, Card, options);
    expect(first.usage.costUsd).toBe(fixture.ledger.monthLines(2026, 3)[0]?.costUsd);
  });

  it("blocks new calls once the monthly limit is reached", async () => {
    fixture = llmFixture();
    fixture.consent.give("openrouter");
    fixture.settings.update({ monthlyLimitUsd: 1 });
    fixture.ledger.record("openrouter", "m", "x", {
      promptTokens: 1,
      completionTokens: 1,
      costUsd: 1,
    });
    await expect(fixture.guarded.complete(messages, Card, options)).rejects.toMatchObject({
      code: "MONTHLY_LIMIT_REACHED",
      message: expect.stringContaining("2026-03"),
    });
    expect(fixture.inner.calls).toHaveLength(0);
  });

  it("gives, checks and revokes consent", () => {
    fixture = llmFixture();
    expect(fixture.consent.isGiven("openrouter")).toBe(false);
    expect(fixture.consent.givenAt("openrouter")).toBeNull();
    fixture.consent.give("openrouter");
    fixture.consent.give("openrouter");
    expect(fixture.consent.isGiven("openrouter")).toBe(true);
    expect(fixture.consent.givenAt("openrouter")).toBe("2026-03-15T12:00:00.000Z");
    fixture.consent.revoke("openrouter");
    expect(fixture.consent.isGiven("openrouter")).toBe(false);
  });

  it("exposes the provider name and consent requirement of the wrapped provider", () => {
    fixture = llmFixture();
    expect(fixture.guarded.name).toBe("openrouter");
    expect(fixture.guarded.requiresConsent).toBe(true);
  });
});
