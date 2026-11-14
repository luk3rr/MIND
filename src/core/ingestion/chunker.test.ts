/*
 * Filename: chunker.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARD_MAX_CHARS, chunkSegments } from "./chunker.js";

interface Golden {
  segments: { section: string | null; page: number | null; text: string }[];
  chunks: { section: string | null; page: number | null; text: string }[];
  long_text: string;
  long_text_params: { target: number; hard_max: number };
  long_text_chunks: { section: string | null; page: number | null; text: string }[];
}

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "chunker.json"), "utf8"),
) as Golden;

describe("chunkSegments (golden values from the Python implementation)", () => {
  it("chunks the sample material exactly like the Python code", () => {
    expect(chunkSegments(golden.segments)).toEqual(golden.chunks);
  });

  it("splits oversized paragraphs like the Python code", () => {
    const params = golden.long_text_params;
    const segments = [{ text: golden.long_text, section: null, page: null }];
    expect(chunkSegments(segments, params.target, params.hard_max)).toEqual(
      golden.long_text_chunks,
    );
  });
});

describe("chunkSegments", () => {
  it("merges short paragraphs of the same page", () => {
    const chunks = chunkSegments([{ text: "um\n\ndois\n\ntrês", page: 1 }]);
    expect(chunks).toEqual([{ page: 1, section: null, text: "um\n\ndois\n\ntrês" }]);
  });

  it("never crosses pages or sections", () => {
    const chunks = chunkSegments([
      { text: "a", page: 1 },
      { text: "b", page: 2 },
      { text: "c", section: "S" },
    ]);
    expect(chunks.map((c) => [c.page, c.section, c.text])).toEqual([
      [1, null, "a"],
      [2, null, "b"],
      [null, "S", "c"],
    ]);
  });

  it("starts a new chunk when the target size is reached", () => {
    const paragraph = "x".repeat(700);
    const chunks = chunkSegments([{ text: `${paragraph}\n\n${paragraph}`, page: 1 }]);
    expect(chunks).toHaveLength(2);
  });

  it("hard-splits a single huge token stream", () => {
    const chunks = chunkSegments([{ text: "y".repeat(5000), page: 1 }]);
    expect(chunks.every((chunk) => chunk.text.length <= HARD_MAX_CHARS)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe("y".repeat(5000));
  });

  it("returns nothing for no input", () => {
    expect(chunkSegments([])).toEqual([]);
  });
});
