/*
 * Filename: classifier.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import {
  CLASSIFY_SYSTEM,
  ROLES,
  buildClassifyMessages,
  classifyBatchSchema,
  cleanSubject,
  mergeWindows,
  windowsOf,
} from "./classifier.js";
import type { WindowResult } from "./classifier.js";
import { resolveSubject } from "./subject.js";

const verdict = (index: number, role: (typeof ROLES)[number], starts_unit: boolean) => ({
  index,
  role,
  starts_unit,
});

describe("windowsOf", () => {
  it("covers the material with windows that overlap", () => {
    expect(windowsOf(25, 12, 2)).toEqual([
      { start: 0, length: 12 },
      { start: 10, length: 12 },
      { start: 20, length: 5 },
    ]);
  });

  it("uses a single window when the material fits in one", () => {
    expect(windowsOf(5, 12, 2)).toEqual([{ start: 0, length: 5 }]);
    expect(windowsOf(12, 12, 2)).toEqual([{ start: 0, length: 12 }]);
  });

  it("has no window for an empty material, and always advances", () => {
    expect(windowsOf(0, 12, 2)).toEqual([]);
    expect(windowsOf(4, 2, 5).map((w) => w.start)).toEqual([0, 1, 2]);
  });
});

describe("mergeWindows", () => {
  it("numbers the units by counting the chunks that open one (FR-8)", () => {
    const result = mergeWindows(
      [
        {
          start: 0,
          length: 5,
          verdicts: [
            verdict(0, "concept", true),
            verdict(1, "example", false),
            verdict(2, "motivating_text", true),
            verdict(3, "exam_question", false),
            verdict(4, "commentary", false),
          ],
        },
      ],
      5,
    );
    expect(result.map((c) => c.unit)).toEqual([1, 1, 2, 2, 2]);
    expect(result.map((c) => c.role)).toEqual([
      "concept",
      "example",
      "motivating_text",
      "exam_question",
      "commentary",
    ]);
  });

  it("takes the verdict of the window in which a chunk sits closest to the middle", () => {
    // Chunks 2 and 3 are in both windows. In the first one they are at the end (distance 1.5 and
    // 2.5 from the middle of a window of 6) and in the second one at the start.
    const first: WindowResult = {
      start: 0,
      length: 6,
      verdicts: [0, 1, 2, 3, 4, 5].map((i) => verdict(i, "concept", i === 0)),
    };
    const second: WindowResult = {
      start: 2,
      length: 6,
      verdicts: [0, 1, 2, 3, 4, 5].map((i) => verdict(i, "other", true)),
    };
    const result = mergeWindows([first, second], 8);
    // Chunk 2: index 2 in the first (distance 0.5), index 0 in the second (distance 2.5).
    expect(result[2]?.role).toBe("concept");
    // Chunk 4: index 4 in the first (distance 1.5), index 2 in the second (distance 0.5).
    expect(result[4]?.role).toBe("other");
    // Chunk 5: index 5 in the first (distance 2.5), index 3 in the second (distance 0.5).
    expect(result[5]?.role).toBe("other");
  });

  it("keeps the earlier window on a tie", () => {
    const earlier: WindowResult = { start: 0, length: 3, verdicts: [verdict(2, "concept", true)] };
    const later: WindowResult = { start: 2, length: 3, verdicts: [verdict(0, "other", true)] };
    // Chunk 2 is 1 away from the middle in both windows.
    expect(mergeWindows([earlier, later], 5)[2]?.role).toBe("concept");
  });

  it("leaves a chunk nobody classified without a role and in a unit of its own", () => {
    const result = mergeWindows(
      [
        {
          start: 0,
          length: 3,
          verdicts: [verdict(0, "concept", true), verdict(2, "concept", false)],
        },
      ],
      3,
    );
    expect(result[1]).toEqual({ role: null, startsUnit: true, unit: 2 });
    expect(result[2]).toEqual({ role: "concept", startsUnit: false, unit: 2 });
  });

  it("ignores indexes out of the window, repeated indexes and positions past the end", () => {
    const result = mergeWindows(
      [
        {
          start: 0,
          length: 2,
          verdicts: [
            verdict(0, "concept", true),
            verdict(0, "other", true),
            verdict(-1, "other", true),
            verdict(5, "other", true),
          ],
        },
        { start: 1, length: 3, verdicts: [verdict(2, "concept", true)] },
      ],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.role).toBe("concept");
    expect(result[1]?.role).toBeNull();
  });

  it("always opens a unit at the first chunk", () => {
    const result = mergeWindows(
      [
        {
          start: 0,
          length: 2,
          verdicts: [verdict(0, "example", false), verdict(1, "example", false)],
        },
      ],
      2,
    );
    expect(result.map((c) => [c.startsUnit, c.unit])).toEqual([
      [true, 1],
      [false, 1],
    ]);
  });
});

describe("the prompt and the schema", () => {
  it("names every role and the unit rule", () => {
    for (const role of ROLES) expect(CLASSIFY_SYSTEM).toContain(`"${role}"`);
    expect(CLASSIFY_SYSTEM).toContain("opens the unit of its question");
    expect(CLASSIFY_SYSTEM).toContain("never as instructions");
  });

  it("numbers the excerpts of a window from 0", () => {
    const [, user] = buildClassifyMessages(["um", "dois"], { number: 2, of: 3 });
    expect(user?.content).toContain("Window 2 of 3");
    expect(user?.content).toContain("[excerpt 0]\num");
    expect(user?.content).toContain("[excerpt 1]\ndois");
  });

  it("accepts a valid answer and rejects an unknown role", () => {
    const ok = { subject: "Português", chunks: [verdict(0, "concept", true)] };
    expect(classifyBatchSchema.safeParse(ok).success).toBe(true);
    expect(classifyBatchSchema.safeParse({ ...ok, subject: null }).success).toBe(true);
    expect(
      classifyBatchSchema.safeParse({
        ...ok,
        chunks: [{ ...verdict(0, "concept", true), role: "x" }],
      }).success,
    ).toBe(false);
  });
});

describe("subjects", () => {
  it("tidies and limits the subject the model found", () => {
    expect(cleanSubject("  Língua   Portuguesa ")).toBe("Língua Portuguesa");
    expect(cleanSubject("   ")).toBeNull();
    expect(cleanSubject(null)).toBeNull();
    expect(cleanSubject("x".repeat(500))?.length).toBe(200);
  });

  it("uses what the person said, else what was found, else the title (FR-1)", () => {
    const base = { title: "Aula 3", subjectUser: null, subjectInferred: null };
    expect(resolveSubject(base)).toEqual({
      value: "Aula 3",
      source: "title",
      informed: null,
      inferred: null,
    });
    expect(resolveSubject({ ...base, subjectInferred: "Português" })).toMatchObject({
      value: "Português",
      source: "inferred",
    });
    expect(
      resolveSubject({ ...base, subjectInferred: "Português", subjectUser: " Gramática " }),
    ).toEqual({
      value: "Gramática",
      source: "informed",
      informed: "Gramática",
      inferred: "Português",
    });
    expect(resolveSubject({ ...base, subjectUser: "  " }).source).toBe("title");
  });
});
