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
  renderSubject,
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

  it("keeps cards on the subject and lets the model return fewer (FR-2, FR-3)", () => {
    expect(SYSTEM).toContain("SUBJECT of the material");
    expect(SYSTEM).toContain("motivating text of an exam question");
    expect(SYSTEM).toContain("An exam question in the excerpts is not a card");
    expect(SYSTEM).toContain("Return fewer cards than requested, or none");
    const [, task] = buildCardMessages("qa", 4, golden.chunks);
    expect(task?.content).toContain("Create up to 4 flashcards");
    expect(task?.content).not.toContain("exactly");
  });

  it("names the subject before the excerpts, and only when there is one (FR-1)", () => {
    const named = buildCardMessages("qa", 2, golden.chunks, [], {}, { subject: " Ortografia " });
    expect(named[1]?.content).toContain("Subject of the material: Ortografia.\n\nExcerpts:");
    expect(buildCardMessages("qa", 2, golden.chunks, [], {}, { subject: null })).toEqual(
      buildCardMessages("qa", 2, golden.chunks),
    );
    expect(renderSubject({ subject: "  " })).toBe("");
    expect(renderSubject(undefined)).toBe("");
  });

  it("accepts a valid batch and rejects unknown subtypes", () => {
    const card = { subtype: "qa", front: "f", back: "b", source: { chunk_id: 1, quote: "q" } };
    expect(cardBatchSchema.safeParse({ cards: [card] }).success).toBe(true);
    expect(cardBatchSchema.safeParse({ cards: [{ ...card, subtype: "essay" }] }).success).toBe(
      false,
    );
  });
});
