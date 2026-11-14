/*
 * Filename: costs.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { MODELS_URL, monthBounds } from "./costs.js";
import type { FetchLike } from "./openrouter.js";
import { llmFixture } from "../test/llm-fixture.js";

let fixture: ReturnType<typeof llmFixture>;
afterEach(() => fixture.connection.close());

const catalogResponse = (data: unknown[]): Response =>
  new Response(JSON.stringify({ data }), { status: 200 });

function counting(responses: (Response | Error)[]) {
  const queue = [...responses];
  const urls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    urls.push(url);
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetchImpl, urls };
}

describe("PriceCatalog", () => {
  it("stores prices and skips entries without pricing", async () => {
    fixture = llmFixture();
    const { fetchImpl, urls } = counting([
      catalogResponse([
        { id: "a/one", pricing: { prompt: "0.000001", completion: "0.000002" } },
        { id: "b/free", pricing: {} },
        { id: "c/none" },
      ]),
    ]);
    expect(await fixture.catalog.refresh(fetchImpl)).toBe(true);
    expect(urls).toEqual([MODELS_URL]);
    expect(fixture.catalog.knownModels()).toEqual(["a/one"]);
    expect(fixture.catalog.get("a/one")).toEqual({
      promptUsdPerToken: 0.000001,
      completionUsdPerToken: 0.000002,
    });
    expect(fixture.catalog.get("zzz")).toBeNull();
  });

  it("does not fetch again while fresh unless forced, and refreshes a stale cache", async () => {
    fixture = llmFixture();
    const entry = { id: "a/one", pricing: { prompt: "1", completion: "2" } };
    const { fetchImpl, urls } = counting([
      catalogResponse([entry]),
      catalogResponse([entry]),
      catalogResponse([entry]),
    ]);
    await fixture.catalog.refresh(fetchImpl);
    await fixture.catalog.refresh(fetchImpl);
    expect(urls).toHaveLength(1);
    await fixture.catalog.refresh(fetchImpl, true);
    expect(urls).toHaveLength(2);
    fixture.clock.advance(25 * 60 * 60 * 1000);
    expect(fixture.catalog.isFresh()).toBe(false);
    await fixture.catalog.refresh(fetchImpl);
    expect(urls).toHaveLength(3);
  });

  it("fails softly on unusable catalogs and network errors, keeping the last prices", async () => {
    fixture = llmFixture();
    const good = catalogResponse([{ id: "a/one", pricing: { prompt: "1", completion: "2" } }]);
    await fixture.catalog.refresh(counting([good]).fetchImpl);
    for (const response of [
      new Response("{}", { status: 200 }),
      new Response("nope", { status: 500 }),
      new Response("not json", { status: 200 }),
      new TypeError("offline"),
    ]) {
      expect(await fixture.catalog.refresh(counting([response]).fetchImpl, true)).toBe(false);
    }
    expect(fixture.catalog.knownModels()).toEqual(["a/one"]);
  });

  it("estimates at four characters per token and is null for unknown models", async () => {
    fixture = llmFixture();
    await fixture.catalog.refresh(
      counting([
        catalogResponse([{ id: "a/one", pricing: { prompt: "0.001", completion: "0.002" } }]),
      ]).fetchImpl,
    );
    expect(fixture.catalog.estimate("a/one", 400, 50)).toBeCloseTo(100 * 0.001 + 50 * 0.002);
    expect(fixture.catalog.estimate("a/one", 401, 0)).toBeCloseTo(101 * 0.001);
    expect(fixture.catalog.estimate("other", 400, 50)).toBeNull();
  });
});

describe("CostLedger", () => {
  it("prefers the reported cost and falls back to tokens times price", async () => {
    fixture = llmFixture();
    await fixture.catalog.refresh(
      counting([
        catalogResponse([{ id: "a/one", pricing: { prompt: "0.001", completion: "0.002" } }]),
      ]).fetchImpl,
    );
    expect(
      fixture.ledger.record("openrouter", "a/one", "generation", {
        promptTokens: 10,
        completionTokens: 5,
        costUsd: 0.5,
      }),
    ).toBe(0.5);
    expect(
      fixture.ledger.record("openrouter", "a/one", "generation", {
        promptTokens: 10,
        completionTokens: 5,
        costUsd: null,
      }),
    ).toBeCloseTo(10 * 0.001 + 5 * 0.002);
    expect(
      fixture.ledger.record("openrouter", "unknown", "chat", {
        promptTokens: 10,
        completionTokens: 5,
        costUsd: null,
      }),
    ).toBe(0);
  });

  it("only counts the requested month", () => {
    fixture = llmFixture();
    const usage = { promptTokens: 1, completionTokens: 1, costUsd: 1 };
    fixture.ledger.record("p", "m", "a", usage);
    fixture.clock.advance(20 * 24 * 60 * 60 * 1000); // 2026-04-04
    fixture.ledger.record("p", "m", "b", { ...usage, costUsd: 2 });
    expect(fixture.ledger.monthTotal(2026, 3)).toBe(1);
    expect(fixture.ledger.monthTotal(2026, 4)).toBe(2);
    expect(fixture.ledger.spentThisMonth()).toBe(2);
    expect(fixture.ledger.monthLines(2026, 3)).toMatchObject([{ purpose: "a", costUsd: 1 }]);
    expect(fixture.ledger.monthLines(2026, 5)).toEqual([]);
  });

  it("rolls the month bounds over the year", () => {
    expect(monthBounds(2026, 12)).toEqual({
      start: "2026-12-01T00:00:00.000Z",
      end: "2027-01-01T00:00:00.000Z",
    });
  });
});
