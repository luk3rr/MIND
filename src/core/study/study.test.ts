/*
 * Filename: study.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { Rating } from "./scheduler.js";
import { cardSides } from "./rendering.js";
import { fixedClock } from "../test/helpers.js";
import { generationRig } from "../test/generation-fixture.js";
import { studyRig } from "../test/study-fixture.js";
import type { StudyRig } from "../test/study-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";

let rig: StudyRig | undefined;
let drafts: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  await drafts?.core.close();
  rig = undefined;
  drafts = undefined;
});

const MINUTE = 60_000;

describe("cardSides", () => {
  it("shows front and back as written for non-cloze types", () => {
    for (const subtype of ["qa", "compare", "true_false"]) {
      expect(cardSides(subtype, "Pergunta?", "Resposta.")).toEqual({
        front: [{ text: "Pergunta?", hit: false }],
        back: [{ text: "Resposta.", hit: false }],
      });
    }
  });

  it("hides the gaps in the front and reveals them in the back", () => {
    const sides = cardSides("cloze", "A {{c1::mitocôndria}} faz a {{c2::respiração}} celular.", "");
    expect(sides.front.map((p) => p.text).join("")).toBe("A […] faz a […] celular.");
    expect(sides.back.filter((p) => p.hit).map((p) => p.text)).toEqual([
      "mitocôndria",
      "respiração",
    ]);
    expect(sides.back.map((p) => p.text).join("")).toBe("A mitocôndria faz a respiração celular.");
  });

  it("puts the extra comment after the revealed sentence and keeps gapless text unchanged", () => {
    expect(
      cardSides("cloze", "O {{c1::núcleo}} guarda o DNA.", "  Organela dupla. ").back.at(-1),
    ).toEqual({
      text: "\n\nOrganela dupla.",
      hit: false,
    });
    expect(cardSides("cloze", "Sem lacuna.", "")).toEqual({
      front: [{ text: "Sem lacuna.", hit: false }],
      back: [{ text: "Sem lacuna.", hit: false }],
    });
  });
});

describe("StudyService settings", () => {
  it("returns defaults and validates updates by field", async () => {
    rig = await studyRig(1);
    const study = rig.core.study(rig.workspaceId);
    expect(study.settings()).toEqual({ newPerDay: 20, dailyGoal: 40, desiredRetention: 0.9 });
    expect(study.updateSettings({ newPerDay: 5, dailyGoal: 10, desiredRetention: 0.95 })).toEqual({
      newPerDay: 5,
      dailyGoal: 10,
      desiredRetention: 0.95,
    });
    for (const [bad, field] of [
      [{ newPerDay: 501 }, "newPerDay"],
      [{ newPerDay: -1 }, "newPerDay"],
      [{ dailyGoal: 0 }, "dailyGoal"],
      [{ desiredRetention: 0.5 }, "desiredRetention"],
    ] as const) {
      expect(() => study.updateSettings(bad)).toThrowError(
        expect.objectContaining({ fields: [expect.objectContaining({ field })] }),
      );
    }
  });
});

describe("StudyService queue and rating (FR-12, FR-13)", () => {
  it("studies only approved cards and serves new ones in approval order", async () => {
    rig = await studyRig(4);
    const study = rig.core.study(rig.workspaceId);
    expect(study.queue(10).map((c) => c.item.id)).toEqual(rig.itemIds);
    expect(study.nextCard()?.schedule).toBeNull();
    expect(study.counts()).toMatchObject({ newAvailable: 4, toStudy: 4, learning: 0, review: 0 });
  });

  it("has no session without approved cards (drafts are not studied)", async () => {
    drafts = generationRig({ clock: fixedClock(), tzOffset: () => 0 });
    const run = drafts.core.generation(drafts.workspaceId).start({
      materialId: drafts.materialId,
      subtype: "qa",
      quantity: 3,
      kind: "card",
    });
    await drafts.core.queue.wait(drafts.workspaceId, run.jobId as number);
    const study = drafts.core.study(drafts.workspaceId);
    expect(drafts.core.review(drafts.workspaceId).count({ status: "draft" })).toBe(3);
    expect(study.nextCard()).toBeNull();
    expect(study.queue()).toEqual([]);
    expect(study.counts()).toMatchObject({ toStudy: 0 });
  });

  it("rating a new card stores its state and a log and moves on", async () => {
    rig = await studyRig(3);
    const study = rig.core.study(rig.workspaceId);
    const first = rig.itemIds[0] as number;
    const updated = study.rate(first, Rating.GOOD, { now: rig.clock.now(), durationMs: 4200 });
    expect(updated).toMatchObject({ state: 1, reps: 1, lapses: 0 });
    // The card is in learning but not due yet, so the next new card comes first.
    expect(study.nextCard()?.item.id).toBe(rig.itemIds[1]);
    expect(study.queue(10).map((c) => c.item.id)).toEqual([rig.itemIds[1], rig.itemIds[2], first]);
    expect(study.counts()).toMatchObject({ learning: 1, newAvailable: 2 });
    const logs = rig.core.registry
      .open(rig.workspaceId)
      .connection.sqlite.prepare("SELECT * FROM review_log")
      .all() as {
      rating: number;
      duration_ms: number;
      day: string;
      previous_state_json: string | null;
    }[];
    expect(logs).toMatchObject([
      { rating: 3, duration_ms: 4200, day: "2026-03-10", previous_state_json: null },
    ]);
    expect(study.counts()).toMatchObject({ reviewedToday: 1, newStudiedToday: 1 });
  });

  it("brings a failed card back within the learn-ahead window", async () => {
    rig = await studyRig(1);
    const study = rig.core.study(rig.workspaceId);
    study.rate(rig.itemIds[0] as number, Rating.AGAIN, { now: rig.clock.now() });
    expect(study.nextCard(new Date(rig.clock.now().getTime() + MINUTE))?.item.id).toBe(
      rig.itemIds[0],
    );
    expect(study.counts().learning).toBe(1);
    // An hour earlier the card (due in a minute) is outside the 20-minute learn-ahead window.
    expect(study.counts(new Date(rig.clock.now().getTime() - 3_600_000)).learning).toBe(0);
  });

  it("serves learning cards first, then reviews due today, then new ones", async () => {
    rig = await studyRig(4);
    const study = rig.core.study(rig.workspaceId);
    const [a, b, , d] = rig.itemIds as [number, number, number, number];
    const t0 = rig.clock.now();
    study.rate(a, Rating.EASY, { now: t0 }); // graduates: review state, due in days
    study.rate(b, Rating.GOOD, { now: t0 }); // learning, due in minutes
    const soon = new Date(t0.getTime() + 15 * MINUTE);
    const order = study.queue(10, soon).map((c) => c.item.id);
    expect(order[0]).toBe(b);
    expect(order.at(-1)).toBe(d);
    expect(order).not.toContain(a);
  });

  it("does not bring a card rated again or hard straight back while others wait", async () => {
    rig = await studyRig(3);
    const study = rig.core.study(rig.workspaceId);
    const [a, b] = rig.itemIds as [number, number, number];
    study.rate(a, Rating.AGAIN, { now: rig.clock.now() });
    expect(study.nextCard()?.item.id).toBe(b);
    study.rate(b, Rating.HARD, { now: rig.clock.now() });
    expect(study.nextCard()?.item.id).toBe(rig.itemIds[2]);
  });

  it("includes reviews due later today but not tomorrow", async () => {
    rig = await studyRig(2);
    const study = rig.core.study(rig.workspaceId);
    const [a] = rig.itemIds as [number, number];
    const learned = study.rate(a, Rating.EASY, { now: rig.clock.now() });
    const due = new Date(learned.due);
    expect(study.counts(new Date(due.getTime() - 3_600_000)).review).toBe(1);
    expect(study.counts(new Date(due.getTime() - 3 * 86_400_000)).review).toBe(0);
  });

  it("limits new cards per study day and the day turns over at 4 am", async () => {
    rig = await studyRig(5, { newPerDay: 2 });
    const study = rig.core.study(rig.workspaceId);
    expect(study.counts().newAvailable).toBe(2);
    study.rate(rig.itemIds[0] as number, Rating.GOOD, { now: rig.clock.now() });
    study.rate(rig.itemIds[1] as number, Rating.GOOD, { now: rig.clock.now() });
    expect(study.counts()).toMatchObject({ newAvailable: 0, newStudiedToday: 2 });
    // Still the same study day at 03:30 the next calendar day; a new one from 04:00.
    expect(study.counts(new Date("2026-03-11T03:30:00Z")).newStudiedToday).toBe(2);
    expect(study.counts(new Date("2026-03-11T04:00:00Z"))).toMatchObject({
      newStudiedToday: 0,
      newAvailable: 2,
    });
  });

  it("undoes the last rating: restores the state or forgets a new card", async () => {
    rig = await studyRig(2);
    const study = rig.core.study(rig.workspaceId);
    expect(study.undo()).toBeNull();
    const a = rig.itemIds[0] as number;
    study.rate(a, Rating.GOOD, { now: rig.clock.now() });
    expect(study.undo()).toBe(a);
    expect(study.card(a).schedule).toBeNull();
    expect(study.counts().reviewedToday).toBe(0);
    const first = study.rate(a, Rating.GOOD, { now: rig.clock.now() });
    study.rate(a, Rating.GOOD, { now: new Date(first.due) });
    expect(study.undo()).toBe(a);
    expect(study.card(a).schedule).toMatchObject({ state: 1, reps: 1, due: first.due });
  });

  it("requires an approved card and reports unknown items", async () => {
    drafts = generationRig({ clock: fixedClock(), tzOffset: () => 0 });
    const run = drafts.core.generation(drafts.workspaceId).start({
      materialId: drafts.materialId,
      subtype: "qa",
      quantity: 1,
      kind: "card",
    });
    await drafts.core.queue.wait(drafts.workspaceId, run.jobId as number);
    const study = drafts.core.study(drafts.workspaceId);
    const draft = drafts.core.review(drafts.workspaceId).list({ runId: run.id })[0];
    expect(() => study.rate(draft?.id as number, Rating.GOOD)).toThrowError(/Só cards aprovados/);
    expect(() => study.rate(9999, Rating.GOOD)).toThrowError(/Não existe item/);
  });

  it("previews every rating without changing anything and counts the day's ratings", async () => {
    rig = await studyRig(1);
    const study = rig.core.study(rig.workspaceId);
    const card = study.nextCard();
    const previews = study.previews(card as never);
    expect(Object.keys(previews).sort()).toEqual(["1", "2", "3", "4"]);
    expect(previews[Rating.AGAIN]).toMatch(/min/);
    expect(study.card(rig.itemIds[0] as number).schedule).toBeNull();
    study.rate(rig.itemIds[0] as number, Rating.GOOD, { now: rig.clock.now() });
    study.rate(rig.itemIds[0] as number, Rating.GOOD, {
      now: new Date(rig.clock.now().getTime() + 10 * MINUTE),
    });
    expect(study.ratingDistribution()).toEqual({ 3: 2 });
  });
});

describe("StudyService filters and facets", () => {
  it("filters by topic, material and card type, combining with AND", async () => {
    rig = await studyRig(4);
    const study = rig.core.study(rig.workspaceId);
    expect(study.queue(10, undefined, { kind: "card" })).toHaveLength(4);
    expect(study.queue(10, undefined, { materialId: rig.materialId })).toHaveLength(4);
    expect(study.queue(10, undefined, { materialId: 999 })).toHaveLength(0);
    expect(study.queue(10, undefined, { subtype: "cloze" })).toHaveLength(0);
    expect(study.queue(10, undefined, { subtype: "qa", materialId: rig.materialId })).toHaveLength(
      4,
    );
    expect(study.queue(10, undefined, { kind: "question" })).toHaveLength(0);
    const topics = study.facets().topics;
    expect(study.queue(10, undefined, { topicId: topics[0]?.key as number })).toHaveLength(4);
  });

  it("keeps the new-card limit global across filters", async () => {
    rig = await studyRig(4, { newPerDay: 2 });
    const study = rig.core.study(rig.workspaceId);
    expect(study.counts(undefined, { materialId: rig.materialId }).newAvailable).toBe(2);
    expect(study.queue(10, undefined, { materialId: rig.materialId })).toHaveLength(2);
  });

  it("lists the options with their approved counts", async () => {
    rig = await studyRig(3);
    const facets = rig.core.study(rig.workspaceId).facets();
    expect(facets).toMatchObject({ cards: 3, questions: 0 });
    expect(facets.materials).toEqual([{ key: rig.materialId, label: "Biologia", count: 3 }]);
    expect(facets.subtypes).toEqual([{ key: "qa", label: "qa", count: 3 }]);
    expect(facets.topics).toEqual([
      { key: expect.any(Number), label: "Tópico de teste", count: 3 },
    ]);
  });
});

describe("studying is offline", () => {
  it("never calls the provider or the network", async () => {
    rig = await studyRig(2);
    const calls = (rig.core.llm.provider as unknown as { inner?: { calls: unknown[] } }).inner;
    const before = calls?.calls.length ?? 0;
    const study = rig.core.study(rig.workspaceId);
    study.rate(rig.itemIds[0] as number, Rating.GOOD, { now: rig.clock.now() });
    study.queue();
    study.counts();
    expect(calls?.calls.length ?? 0).toBe(before);
  });
});
