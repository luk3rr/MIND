/*
 * Filename: planning.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import {
  SOURCE_ROLES,
  UNIT_BATCH_MAX_CHARS,
  batchKey,
  chunkLabel,
  makeBatches,
  planBatches,
  planFrom,
  planMore,
  planMoreFrom,
  pyRound,
  splitQuantity,
  spreadIndices,
  unitBatches,
} from "./planning.js";
import { ALLOWED } from "../test/relevance/cases.js";
import type { SourceChunk } from "./planning.js";

const chunk = (id: number, size = 1000, page: number | null = null): SourceChunk => ({
  id,
  materialId: 1,
  materialTitle: "Aula",
  page,
  section: null,
  text: "x".repeat(size),
});

describe("planning (ported from the Python tests)", () => {
  it("builds a label from the title, page and section", () => {
    expect(chunkLabel({ ...chunk(1), page: 3, section: "Cap 1" })).toBe("Aula p.3 Cap 1");
    expect(chunkLabel({ ...chunk(1), materialTitle: "Notas" })).toBe("Notas");
  });

  it("groups chunks up to the character budget", () => {
    const batches = makeBatches(
      Array.from({ length: 5 }, (_, i) => chunk(i, 2500)),
      6000,
    );
    expect(batches.map((b) => b.map((c) => c.id))).toEqual([[0, 1], [2, 3], [4]]);
    expect(makeBatches([])).toEqual([]);
  });

  it("gives an oversized chunk its own batch", () => {
    expect(
      makeBatches([chunk(1, 10_000), chunk(2, 100)], 6000).map((b) => b.map((c) => c.id)),
    ).toEqual([[1], [2]]);
  });

  it.each([
    [20, 4, [5, 5, 5, 5]],
    [22, 5, [5, 5, 4, 4, 4]],
    [3, 3, [1, 1, 1]],
    [7, 1, [7]],
  ])("splits %i into %i parts as evenly as possible", (quantity, parts, expected) => {
    expect(splitQuantity(quantity, parts)).toEqual(expected);
  });

  it("rounds halves to even like Python", () => {
    expect([0.5, 1.5, 2.5, 4.5, 2.4, 2.6].map(pyRound)).toEqual([0, 2, 2, 4, 2, 3]);
  });

  it("spreads indices over the whole range", () => {
    expect(spreadIndices(10, 3)).toEqual([0, 4, 9]);
    expect(spreadIndices(4, 4)).toEqual([0, 1, 2, 3]);
    expect(spreadIndices(3, 10)).toEqual([0, 1, 2]);
    expect(spreadIndices(9, 1)).toEqual([4]);
  });

  it("asks five cards per batch and spreads the batches", () => {
    const plan = planBatches(
      Array.from({ length: 12 }, (_, i) => chunk(i, 6000)),
      20,
    );
    expect(plan.map((p) => p.count)).toEqual([5, 5, 5, 5]);
    expect(plan.map((p) => p.chunks[0]?.id)).toEqual([0, 4, 7, 11]);
  });

  it("uses every batch when there are few and returns nothing without input", () => {
    expect(planBatches([chunk(1), chunk(2, 6000)], 20).map((p) => p.count)).toEqual([10, 10]);
    expect(planBatches([], 5)).toEqual([]);
    expect(planBatches([chunk(1)], 0)).toEqual([]);
  });

  it("uses the first batches when spreading is off", () => {
    const plan = planBatches(
      Array.from({ length: 12 }, (_, i) => chunk(i, 6000)),
      10,
      5,
      false,
    );
    expect(plan.map((p) => p.chunks[0]?.id)).toEqual([0, 1]);
  });
});

describe("batches by unit (FR-10)", () => {
  type Role = NonNullable<SourceChunk["role"]>;
  /** A chunk of an analyzed material: its role and the unit it belongs to. */
  const analyzed = (id: number, role: Role | null, unit: number, size = 500): SourceChunk => ({
    ...chunk(id, size),
    role,
    unit,
  });
  const ids = (batches: SourceChunk[][]): number[][] => batches.map((b) => b.map((c) => c.id));

  it("never splits a unit: a question with its motivating text and statement stays whole", () => {
    // Units: [1 concept] [2 motivating, 3 question, 4 commentary] [5 concept]. A small budget
    // would cut the question in two if it counted chunks, not units.
    const chunks = [
      analyzed(1, "concept", 1, 800),
      analyzed(2, "motivating_text", 2, 800),
      analyzed(3, "exam_question", 2, 800),
      analyzed(4, "commentary", 2, 800),
      analyzed(5, "concept", 3, 800),
    ];
    const batches = unitBatches(chunks, "question", 2000);
    expect(ids(batches)).toEqual([[1], [2, 3, 4], [5]]);
  });

  it("sends a motivating text only as context, next to the question it opens", () => {
    const chunks = [
      analyzed(1, "motivating_text", 1),
      analyzed(2, "exam_question", 1),
      analyzed(3, "commentary", 1),
    ];
    const [batch] = unitBatches(chunks, "question");
    expect(batch?.map((c) => [c.id, c.context === true])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
  });

  it("takes for cards only content, examples and the comment, with the question as context", () => {
    const chunks = [
      analyzed(1, "concept", 1),
      analyzed(2, "example", 1),
      analyzed(3, "motivating_text", 2),
      analyzed(4, "exam_question", 2),
      analyzed(5, "commentary", 2),
      analyzed(6, "other", 3),
    ];
    const [batch] = unitBatches(chunks, "card");
    expect(batch?.map((c) => [c.id, c.context === true])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true],
      [5, false],
    ]);
    // The cover or the table of contents is never sent, not even as context.
    expect(batch?.some((c) => c.id === 6)).toBe(false);
  });

  it("drops a unit with nothing that may be a source", () => {
    const chunks = [
      analyzed(1, "other", 1),
      analyzed(2, "motivating_text", 2),
      analyzed(3, "concept", 3),
    ];
    expect(ids(unitBatches(chunks, "card"))).toEqual([[3]]);
    expect(ids(unitBatches(chunks, "question"))).toEqual([[3]]);
    expect(unitBatches([analyzed(1, "other", 1)], "card")).toEqual([]);
  });

  it("takes a chunk without a role as content, in a unit of its own", () => {
    const chunks = [analyzed(1, "concept", 1), analyzed(2, null, 2), analyzed(3, "other", 3)];
    expect(ids(unitBatches(chunks, "card"))).toEqual([[1, 2]]);
  });

  it("uses a question of the exam only as inspiration for questions", () => {
    const chunks = [analyzed(1, "exam_question", 1), analyzed(2, "commentary", 1)];
    expect(ids(unitBatches(chunks, "question"))).toEqual([[1, 2]]);
    // For cards the statement is context and the comment is the source.
    expect(unitBatches(chunks, "card")[0]?.map((c) => [c.id, c.context === true])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("splits a unit that alone is bigger than the cap at a chunk boundary", () => {
    const big = Array.from({ length: 4 }, (_, i) => analyzed(i + 1, "concept", 1, 4000));
    const batches = unitBatches(big, "card", 6000);
    expect(ids(batches)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(UNIT_BATCH_MAX_CHARS).toBe(9000);
  });

  it("packs small units together up to the budget", () => {
    const chunks = Array.from({ length: 6 }, (_, i) => analyzed(i + 1, "concept", i + 1, 1500));
    expect(ids(unitBatches(chunks, "card", 6000))).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it("allows the same roles as the labelled fixtures do", () => {
    expect(SOURCE_ROLES.card).toEqual(ALLOWED.card);
    expect(SOURCE_ROLES.question).toEqual(ALLOWED.question);
  });

  it("plans the same way over batches already made, and tells batches apart by their source", () => {
    const chunks = Array.from({ length: 5 }, (_, i) => chunk(i + 1, 2500));
    const batches = makeBatches(chunks);
    expect(planFrom(batches, 6, 5, true)).toEqual(planBatches(chunks, 6, 5, true));
    // Two batches that start with the same context chunk are still different batches.
    const context = { ...chunk(9), context: true };
    const a = [context, chunk(1)];
    const b = [context, chunk(2)];
    expect(batchKey(a)).toBe(1);
    expect(batchKey(b)).toBe(2);
    const planned = planFrom([a, b], 1, 5, false);
    expect(planMoreFrom([a, b], planned, 3, 5, false)).toEqual([{ chunks: b, count: 3 }]);
    expect(planMore(chunks, planBatches(chunks, 1, 5, false), 2, 5, false)).toHaveLength(1);
  });
});
