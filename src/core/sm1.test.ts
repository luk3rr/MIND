/*
 * Filename: sm1.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRun } from "./db/workspace-schema.js";
import {
  costPerApproved,
  computeReport,
  formatReport,
  pipelineYield,
  sm1Rate,
  verdict,
} from "./sm1.js";
import { generationRig } from "./test/generation-fixture.js";
import type { GenerationRig } from "./test/generation-fixture.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

const empty = {
  runs: 0,
  generated: 0,
  discardedAutomatically: 0,
  approved: 0,
  approvedUnedited: 0,
  discardedInReview: 0,
  costUsd: 0,
};

describe("SM-1 report", () => {
  it("has no rate before any review and an insufficient verdict", () => {
    expect(sm1Rate(empty)).toBeNull();
    expect(pipelineYield(empty)).toBeNull();
    expect(costPerApproved(empty)).toBeNull();
    expect(verdict(empty)).toBe("insufficient");
  });

  it("judges the target only with a big enough sample", () => {
    const base = { ...empty, approved: 40, discardedInReview: 4 };
    expect(verdict({ ...base, approvedUnedited: 40 })).toBe("met");
    expect(verdict({ ...base, approvedUnedited: 30 })).toBe("not_met");
    expect(verdict({ ...empty, approved: 10, approvedUnedited: 10 })).toBe("insufficient");
  });

  it("sums the runs of a workspace by kind", () => {
    rig = generationRig();
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const values = { kind: "card", subtype: "qa", model: "m", requested: 5 };
    db.insert(generationRun)
      .values({
        ...values,
        generated: 4,
        discardedNoSource: 1,
        approved: 3,
        approvedUnedited: 2,
        discardedReview: 1,
        costUsd: 0.5,
      })
      .run();
    db.insert(generationRun)
      .values({
        ...values,
        generated: 6,
        discardedInvalid: 2,
        approved: 5,
        approvedUnedited: 5,
        costUsd: 0.25,
      })
      .run();
    db.insert(generationRun)
      .values({ ...values, kind: "question", generated: 9 })
      .run();
    const report = computeReport(db);
    expect(report).toEqual({
      runs: 2,
      generated: 10,
      discardedAutomatically: 3,
      approved: 8,
      approvedUnedited: 7,
      discardedInReview: 1,
      costUsd: 0.75,
    });
    expect(sm1Rate(report)).toBeCloseTo(7 / 9);
    expect(pipelineYield(report)).toBeCloseTo(10 / 13);
    expect(computeReport(db, "question").generated).toBe(9);
    const text = formatReport("Estudos", report);
    expect(text).toContain("SM-1 · workspace: Estudos");
    expect(text).toContain("taxa SM-1: 77.8%");
    expect(text).toContain("AMOSTRA INSUFICIENTE");
    expect(formatReport("Q", empty, "question")).toContain("· questões");
  });
});
