/*
 * Filename: source-checker.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SourceChecker, locateQuote, normalize } from "./source-checker.js";

interface Golden {
  chunk: string;
  min_quote_chars: number;
  cases: {
    quote: string;
    valid: boolean;
    reason: string | null;
    start: number | null;
    end: number | null;
  }[];
  normalize: Record<string, { text: string; positions: number[] }>;
}

const golden = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "..", "fixtures", "source-checker.json"),
    "utf8",
  ),
) as Golden;

describe("SourceChecker (golden values from the Python implementation)", () => {
  const checker = new SourceChecker(golden.min_quote_chars);

  it.each(golden.cases.map((c, index) => [index, c] as const))("case %i", (_index, item) => {
    const result = checker.check(item.quote, golden.chunk);
    expect(result).toEqual({ valid: item.valid, reason: item.reason });
    const match = locateQuote(golden.chunk, item.quote);
    expect(match?.start ?? null).toBe(item.start);
    expect(match?.end ?? null).toBe(item.end);
  });

  it("normalizes text and keeps a position for every output character", () => {
    for (const [input, expected] of Object.entries(golden.normalize)) {
      const result = normalize(input);
      expect(result.text).toBe(expected.text);
      expect(result.positions).toEqual(expected.positions);
    }
  });
});

describe("normalize", () => {
  it("handles ligatures, quotes, dashes, invisible characters and case", () => {
    expect(normalize("ﬁnal “aspas” — traço­​").text).toBe('final "aspas" - traço');
    expect(normalize("  A\tB\n C  ").text).toBe("a b c");
  });

  it("locates a quote in the original text with half-open bounds", () => {
    const chunk = "Texto  com\n espaços extras aqui.";
    expect(locateQuote(chunk, "com espaços")).toEqual({ start: 7, end: 19 });
    expect(locateQuote(chunk, "")).toBeNull();
    expect(locateQuote(chunk, "inexistente")).toBeNull();
  });
});
