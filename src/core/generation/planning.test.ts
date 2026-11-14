/*
 * Filename: planning.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import {
  chunkLabel,
  makeBatches,
  planBatches,
  pyRound,
  splitQuantity,
  spreadIndices,
} from "./planning.js";
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
