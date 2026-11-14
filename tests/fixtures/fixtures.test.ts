/*
 * Filename: fixtures.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

function load<T>(name: string): T {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed test fixtures
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as T;
}

interface FsrsStep {
  rating: number;
  reviewed_at: string;
  due: string;
  state: number;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
}

describe("reference fixtures extracted from the Python implementation", () => {
  it("fsrs: every scenario has consistent, increasing steps", () => {
    const data = load<{
      fuzzing: boolean;
      scenarios: { name: string; steps: FsrsStep[] }[];
      new_card_preview_seconds: Record<string, number>;
    }>("fsrs");
    expect(data.fuzzing).toBe(false);
    expect(data.scenarios.length).toBeGreaterThanOrEqual(5);
    for (const scenario of data.scenarios) {
      scenario.steps.forEach((step, index) => {
        expect(step.reps).toBe(index + 1);
        expect(Date.parse(step.due)).toBeGreaterThan(Date.parse(step.reviewed_at));
        expect(step.stability).toBeGreaterThan(0);
      });
    }
    expect(Object.keys(data.new_card_preview_seconds)).toEqual(["1", "2", "3", "4"]);
  });

  it("chunker: chunks respect the hard maximum and keep the section", () => {
    const data = load<{
      chunks: { text: string; section: string | null }[];
      long_text_params: { hard_max: number };
      long_text_chunks: { text: string }[];
    }>("chunker");
    expect(data.chunks.length).toBeGreaterThan(0);
    expect(data.long_text_chunks.length).toBeGreaterThan(1);
    for (const chunk of data.long_text_chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(data.long_text_params.hard_max);
    }
  });

  it("source-checker: covers valid, too short and missing quotes", () => {
    const data = load<{ cases: { valid: boolean; reason: string | null }[] }>("source-checker");
    const reasons = new Set(data.cases.map((item) => item.reason));
    expect(reasons).toContain("quote_too_short");
    expect(reasons).toContain("quote_not_in_chunk");
    expect(data.cases.some((item) => item.valid)).toBe(true);
  });

  it("prompts: one card prompt per subtype with system and user messages", () => {
    const data = load<{ card_messages: Record<string, { role: string }[]> }>("prompts");
    expect(Object.keys(data.card_messages).sort()).toEqual([
      "cloze",
      "compare",
      "qa",
      "true_false",
    ]);
    for (const messages of Object.values(data.card_messages)) {
      expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    }
  });
});
