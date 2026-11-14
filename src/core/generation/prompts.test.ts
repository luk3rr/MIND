/*
 * Filename: prompts.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_SUBTYPES, cardBatchSchema } from "./schemas.js";
import {
  MAX_QUOTE,
  MIN_QUOTE,
  SUBTYPE_RULES,
  SYSTEM,
  buildCardMessages,
  renderAvoid,
  renderChunks,
} from "./prompts.js";

interface Golden {
  chunks: { id: number; label: string; text: string }[];
  avoid: string[];
  count: number;
  rendered_chunks: string;
  rendered_avoid: string;
  card_messages: Record<string, { role: string; content: string }[]>;
}

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "prompts.json"), "utf8"),
) as Golden;

describe("card prompts (golden values from the Python implementation)", () => {
  it("renders chunks and the avoid list exactly like the Python code", () => {
    expect(renderChunks(golden.chunks)).toBe(golden.rendered_chunks);
    expect(renderAvoid(golden.avoid)).toBe(golden.rendered_avoid);
    expect(renderAvoid([])).toBe("");
  });

  it.each(Object.keys(golden.card_messages))(
    "builds the %s prompt with identical text",
    (subtype) => {
      expect(buildCardMessages(subtype, golden.count, golden.chunks, golden.avoid)).toEqual(
        golden.card_messages[subtype],
      );
    },
  );
});

describe("card prompt rules", () => {
  it("has rules for every subtype", () => {
    for (const subtype of CARD_SUBTYPES) expect(SUBTYPE_RULES[subtype]).toBeTruthy();
  });

  it("demands pt-BR, verbatim quotes with a size range and LaTeX", () => {
    expect(SYSTEM).toContain("Brazilian Portuguese (pt-BR)");
    expect(SYSTEM).toContain("VERBATIM");
    expect(SYSTEM).toContain(`between ${MIN_QUOTE} and ${MAX_QUOTE} characters`);
    expect(SYSTEM).toContain("LaTeX");
  });

  it("accepts a valid batch and rejects unknown subtypes", () => {
    const card = { subtype: "qa", front: "f", back: "b", source: { chunk_id: 1, quote: "q" } };
    expect(cardBatchSchema.safeParse({ cards: [card] }).success).toBe(true);
    expect(cardBatchSchema.safeParse({ cards: [{ ...card, subtype: "essay" }] }).success).toBe(
      false,
    );
  });
});
