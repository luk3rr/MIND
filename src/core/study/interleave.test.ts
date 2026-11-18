/*
 * Filename: interleave.test.ts
 * Created on: November 18, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { NO_KEY, interleave, mixKeyOf, pick } from "./interleave.js";

interface Row {
  name: string;
  topic: number | null;
}
const row = (name: string, topic: number | null): Row => ({ name, topic });
const key = (item: Row): string => mixKeyOf("topic", { topicId: item.topic });
const names = (rows: Row[]): string[] => rows.map((item) => item.name);

describe("mixKeyOf", () => {
  it("builds the key from the topic or the material, and none when there is no id", () => {
    expect(mixKeyOf("topic", { topicId: 3 })).toBe("t:3");
    expect(mixKeyOf("material", { topicId: 3, materialId: 9 })).toBe("m:9");
    expect(mixKeyOf("topic", { topicId: null })).toBe(NO_KEY);
    expect(mixKeyOf("material", { topicId: 3, materialId: null })).toBe(NO_KEY);
    expect(mixKeyOf("material", { topicId: 3 })).toBe(NO_KEY);
  });
});

describe("pick and interleave (FR-14)", () => {
  const rows = [row("A1", 1), row("A2", 1), row("A3", 1), row("A4", 1), row("B1", 2), row("B2", 2)];

  it("alternates the groups and keeps the order inside each one", () => {
    expect(names(interleave(rows, key))).toEqual(["A1", "B1", "A2", "B2", "A3", "A4"]);
  });

  it("continues after the key of the last item shown", () => {
    expect(pick(rows, key, null)?.name).toBe("A1");
    expect(pick(rows, key, "t:1")?.name).toBe("B1");
    expect(pick(rows, key, "t:2")?.name).toBe("A1");
  });

  it("goes back to the first group when no group comes after the key", () => {
    expect(pick([row("A3", 1), row("A4", 1)], key, "t:2")?.name).toBe("A3");
    expect(pick([row("A3", 1)], key, "t:1")?.name).toBe("A3");
  });

  it("puts the items without a topic in a group of their own, last in the rotation", () => {
    const mixed = [row("N1", null), row("A1", 1), row("N2", null), row("B1", 2)];
    expect(names(interleave(mixed, key))).toEqual(["A1", "B1", "N1", "N2"]);
    expect(pick(mixed, key, NO_KEY)?.name).toBe("A1");
  });

  it("orders groups by identifier, not by where they first appear", () => {
    const shuffled = [row("B1", 20), row("A1", 3), row("C1", 100)];
    expect(names(interleave(shuffled, key))).toEqual(["A1", "B1", "C1"]);
  });

  it("handles one group and an empty list", () => {
    expect(names(interleave([row("A1", 1), row("A2", 1)], key))).toEqual(["A1", "A2"]);
    expect(pick([], key, null)).toBeNull();
    expect(interleave([], key)).toEqual([]);
  });

  it("starts the whole rotation after the given key", () => {
    expect(names(interleave(rows, key, "t:1"))).toEqual(["B1", "A1", "B2", "A2", "A3", "A4"]);
  });

  it("rotates across calls when the picked item leaves the list, as the queues do", () => {
    const left = [...rows];
    const shown: string[] = [];
    let after: string | null = null;
    while (left.length > 0) {
      const next = pick(left, key, after) as Row;
      shown.push(next.name);
      left.splice(left.indexOf(next), 1);
      after = key(next);
    }
    expect(shown).toEqual(["A1", "B1", "A2", "B2", "A3", "A4"]);
  });
});

describe("determinism and speed (NFR-3, NFR-4)", () => {
  const many = Array.from({ length: 5000 }, (_, index) => row(`I${index}`, (index * 7) % 40));

  it("gives the same item every time for the same input", () => {
    const first = pick(many, key, "t:5")?.name;
    for (let run = 0; run < 100; run += 1) expect(pick(many, key, "t:5")?.name).toBe(first);
  });

  it("picks from 5,000 items well under 200 ms", () => {
    const started = performance.now();
    for (let run = 0; run < 20; run += 1) pick(many, key, `t:${run}`);
    expect((performance.now() - started) / 20).toBeLessThan(200);
  });
});
