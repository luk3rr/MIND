/*
 * Filename: review.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

async function generated(quantity = 6) {
  rig = generationRig();
  const generation = rig.core.generation(rig.workspaceId);
  const run = generation.start({
    materialId: rig.materialId,
    subtype: "qa",
    quantity,
    kind: "card",
  });
  await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
  return { run, generation, review: rig.core.review(rig.workspaceId) };
}

describe("ReviewService", () => {
  it("lists drafts of a run with their source and counts them (FR-8)", async () => {
    const { run, review } = await generated();
    const drafts = review.list({ runId: run.id, status: "draft" });
    expect(drafts).toHaveLength(6);
    expect(review.count({ runId: run.id, status: "draft" })).toBe(6);
    expect(drafts[0]).toMatchObject({
      kind: "card",
      subtype: "qa",
      sourceTitle: "Biologia",
      edited: false,
    });
    expect(drafts[0]?.quote.length).toBeGreaterThanOrEqual(15);
    expect(review.sourceText(drafts[0]?.chunkId ?? null)).toContain("fotossíntese");
    expect(review.sourceText(null)).toBeNull();
    expect(review.sourceText(99999)).toBeNull();
  });

  it("approves some and discards others, keeping the run counters (SM-1)", async () => {
    const { run, review, generation } = await generated();
    const ids = review.list({ runId: run.id }).map((item) => item.id);
    expect(review.review(ids.slice(0, 3), ids.slice(3, 5))).toEqual({
      approved: 3,
      discarded: 2,
      skipped: 0,
    });
    expect(review.count({ status: "approved" })).toBe(3);
    expect(review.count({ status: "discarded" })).toBe(2);
    expect(generation.get(run.id)).toMatchObject({
      approved: 3,
      approvedUnedited: 3,
      discardedReview: 2,
    });
    expect(review.review(ids.slice(0, 1), [ids[0] as number, 999])).toEqual({
      approved: 0,
      discarded: 0,
      skipped: 3,
    });
  });

  it("edits a draft, validates the form and counts approvals of edited items apart", async () => {
    const { run, review, generation } = await generated(2);
    const [first, second] = review.list({ runId: run.id });
    const edited = review.edit(
      first?.id as number,
      "  Nova pergunta?  ",
      "Nova resposta",
      "Tópico Novo",
    );
    expect(edited).toMatchObject({
      front: "Nova pergunta?",
      back: "Nova resposta",
      edited: true,
      topic: "Tópico Novo",
    });
    expect(edited.quote).toBe(first?.quote);
    expect(() => review.edit(first?.id as number, " ", "x", null)).toThrowError(/frente do card/);
    expect(() => review.edit(first?.id as number, "f", " ", null)).toThrowError(/verso do card/);
    review.review([first?.id as number, second?.id as number]);
    expect(generation.get(run.id)).toMatchObject({ approved: 2, approvedUnedited: 1 });
    const same = review.edit(
      second?.id as number,
      second?.front as string,
      second?.back as string,
      null,
    );
    expect(same.edited).toBe(false);
  });

  it("does not edit discarded items and reports unknown ones", async () => {
    const { run, review } = await generated(1);
    const [only] = review.list({ runId: run.id });
    review.review([], [only?.id as number]);
    expect(() => review.edit(only?.id as number, "a", "b", null)).toThrowError(/descartados/);
    expect(() => review.get(9999)).toThrowError(/Não existe item/);
    expect(() => review.edit(9999, "a", "b", null)).toThrowError(/Não existe item/);
  });

  it("approves every draft of a run at once", async () => {
    const { run, review } = await generated(5);
    expect(review.approveAll(run.id)).toEqual({ approved: 5, discarded: 0, skipped: 0 });
    expect(review.count({ runId: run.id, status: "draft" })).toBe(0);
    expect(review.approveAll(run.id)).toEqual({ approved: 0, discarded: 0, skipped: 0 });
  });
});
