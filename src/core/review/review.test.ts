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

  it("discards an approved item without touching the run counters", async () => {
    const { run, review, generation } = await generated(3);
    const [first, second] = review.list({ runId: run.id }).map((entry) => entry.id) as [
      number,
      number,
    ];
    review.review([first]);
    const before = generation.get(run.id);
    expect(generation.view(before).pending).toBe(2);
    expect(review.discardApproved(first)).toBe(true);
    expect(review.get(first).status).toBe("discarded");
    // A draft is reviewed in the review screen, and a discarded item has nothing left to discard.
    expect(review.discardApproved(second)).toBe(false);
    expect(review.discardApproved(first)).toBe(false);
    expect(() => review.discardApproved(9999)).toThrowError(/Não existe item/);
    expect(generation.get(run.id)).toEqual(before);
    expect(generation.view(before).pending).toBe(2);
    review.approveAll(run.id);
    expect(generation.view(generation.get(run.id)).pending).toBe(0);
  });

  it("restores a discarded item: approved if it had been approved, otherwise a draft", async () => {
    const { run, review, generation } = await generated(3);
    const [approved, dropped] = review.list({ runId: run.id }).map((entry) => entry.id) as [
      number,
      number,
      number,
    ];
    review.review([approved], [dropped]);
    review.discardApproved(approved);
    expect(generation.get(run.id).discardedReview).toBe(1);

    expect(review.restore(approved)).toBe("approved");
    expect(review.get(approved).status).toBe("approved");
    expect(review.restore(dropped)).toBe("draft");
    expect(review.get(dropped).status).toBe("draft");
    expect(generation.get(run.id).discardedReview).toBe(0);
    expect(generation.view(generation.get(run.id)).pending).toBe(2);
    // Nothing to restore the second time or for an item that was never discarded.
    expect(review.restore(approved)).toBeNull();
    expect(() => review.restore(9999)).toThrowError(/Não existe item/);
  });

  it("counts the pending drafts of many runs in one go, like the view of each one", async () => {
    const { run, review, generation } = await generated(4);
    const second = generation.start({
      materialId: rig?.materialId as number,
      subtype: "cloze",
      quantity: 3,
      kind: "card",
    });
    await rig?.core.queue.wait(rig.workspaceId, second.jobId as number);
    review.approveAll(run.id);
    const runs = generation.listRuns(10);
    const views = generation.views(runs);
    expect(views.map((view) => [view.id, view.pending])).toEqual(
      runs.map((entry) => [entry.id, generation.view(entry).pending]),
    );
    expect(views.find((view) => view.id === run.id)?.pending).toBe(0);
    expect(views.find((view) => view.id === second.id)?.pending).toBeGreaterThan(0);
  });

  it("approves every draft of a run at once", async () => {
    const { run, review } = await generated(5);
    expect(review.approveAll(run.id)).toEqual({ approved: 5, discarded: 0, skipped: 0 });
    expect(review.count({ runId: run.id, status: "draft" })).toBe(0);
    expect(review.approveAll(run.id)).toEqual({ approved: 0, discarded: 0, skipped: 0 });
  });

  it("lists every item of the workspace with its material and topic (catalog)", async () => {
    const { run, review } = await generated(4);
    const catalog = review.catalog();
    expect(catalog).toHaveLength(4);
    expect(catalog[0]).toMatchObject({
      kind: "card",
      status: "draft",
      material: "Biologia",
      materialId: rig?.materialId,
      origin: "generated",
    });
    expect(catalog[0]?.sourceTitle.length).toBeGreaterThan(0);
    expect(catalog[0]?.front.length).toBeGreaterThan(0);
    review.edit(catalog[0]?.id as number, "Frente", "Verso", "Plantas");
    expect(review.catalog()[0]).toMatchObject({ topic: "Plantas", edited: true });
    expect(run.id).toBeGreaterThan(0);
  });

  it("gives a topic, discards, restores and approves many items, skipping what does not fit", async () => {
    const { run, review } = await generated(5);
    const ids = review.list({ runId: run.id }).map((entry) => entry.id);
    expect(review.bulk(ids.slice(0, 3), "approve")).toEqual({ changed: 3, skipped: 0 });
    expect(review.bulk(ids, "approve")).toEqual({ changed: 2, skipped: 3 });
    expect(review.bulk(ids, "topic", "  Fotossíntese  ")).toEqual({ changed: 5, skipped: 0 });
    expect(new Set(review.catalog().map((entry) => entry.topic))).toEqual(
      new Set(["Fotossíntese"]),
    );
    expect(review.bulk([ids[0] as number, 9999], "topic", null)).toEqual({
      changed: 1,
      skipped: 1,
    });
    expect(review.catalog()[0]?.topic).toBeNull();
    expect(review.bulk(ids.slice(0, 2), "discard")).toEqual({ changed: 2, skipped: 0 });
    expect(review.count({ status: "discarded" })).toBe(2);
    expect(review.bulk(ids.slice(0, 3), "restore")).toEqual({ changed: 2, skipped: 1 });
    expect(review.count({ status: "approved" })).toBe(5);
  });

  it("discards drafts in bulk and counts them in the run", async () => {
    const { run, review, generation } = await generated(3);
    const ids = review.list({ runId: run.id }).map((entry) => entry.id);
    expect(review.bulk(ids, "discard")).toEqual({ changed: 3, skipped: 0 });
    expect(generation.get(run.id)).toMatchObject({ discardedReview: 3 });
    expect(review.bulk(ids, "restore")).toEqual({ changed: 3, skipped: 0 });
    expect(generation.get(run.id)).toMatchObject({ discardedReview: 0 });
  });

  it("edits the options and the right answer of a question, keeping the rules", async () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({
      materialId: rig.materialId,
      subtype: "multiple_choice_4",
      quantity: 1,
      kind: "question",
    });
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    const review = rig.core.review(rig.workspaceId);
    const question = review.list({ runId: run.id })[0];
    const options = question?.options ?? [];
    expect(options).toHaveLength(4);
    const id = question?.id as number;
    const changed = options.map((o, i) =>
      i === 1 ? { ...o, text: "Texto novo", why: "Porque sim." } : o,
    );
    const other = options[2]?.key as string;
    const saved = review.edit(id, question?.front ?? "x", question?.back ?? "y", null, {
      options: changed,
      answer: other,
    });
    expect(saved.edited).toBe(true);
    expect(saved.answer).toBe(other);
    expect(saved.options[1]).toMatchObject({ text: "Texto novo", why: "Porque sim." });
    const edit = (choices: Parameters<typeof review.edit>[4]) =>
      review.edit(id, "enunciado", "comentário", null, choices);
    expect(() =>
      edit({ options: changed.map((o, i) => (i === 0 ? { ...o, text: " " } : o)) }),
    ).toThrowError(/vazio/);
    expect(() => edit({ options: changed.map((o) => ({ ...o, text: "igual" })) })).toThrowError(
      /iguais/,
    );
    expect(() => edit({ options: changed.slice(0, 3) })).toThrowError(/mesmas letras/);
    expect(() => edit({ answer: "Z" })).toThrowError(/correta/);
  });
});
