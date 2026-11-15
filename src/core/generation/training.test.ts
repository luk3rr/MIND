/*
 * Filename: training.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { attempt, generationRun, item, reviewLog, topic } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { scriptedCardProvider } from "../llm/scripted.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { MAX_CHUNKS, trainingMaterial } from "./training.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

/** A topic with a card rated Errei (chunk 2) and a question missed twice (chunk 1). */
function weakTopic(r: GenerationRig, name = "Glicose"): number {
  const { db } = r.core.registry.open(r.workspaceId).connection;
  const created = db.insert(topic).values({ name }).returning({ id: topic.id }).get().id;
  const run = db
    .insert(generationRun)
    .values({ kind: "card", subtype: "qa", model: "m", requested: 2 })
    .returning({ id: generationRun.id })
    .get().id;
  const card = db
    .insert(item)
    .values({
      runId: run,
      kind: "card",
      subtype: "qa",
      status: "approved",
      topicId: created,
      chunkId: r.chunkIds[2] as number,
      payloadJson: JSON.stringify({ front: "Card existente?", back: "R" }),
    })
    .returning({ id: item.id })
    .get().id;
  const question = db
    .insert(item)
    .values({
      runId: run,
      kind: "question",
      subtype: "certo_errado",
      status: "approved",
      topicId: created,
      chunkId: r.chunkIds[1] as number,
      payloadJson: JSON.stringify({ statement: "Questão existente?", options: [], answer: "C" }),
    })
    .returning({ id: item.id })
    .get().id;
  db.insert(reviewLog).values({ itemId: card, rating: 1, day: "2026-11-14" }).run();
  for (let i = 0; i < 2; i += 1) {
    db.insert(attempt)
      .values({ itemId: question, answer: "E", correct: false, day: "2026-11-14" })
      .run();
  }
  return created;
}

describe("trainingMaterial", () => {
  it("starts with the chunks behind the mistakes, then the best matches for the topic name", () => {
    rig = generationRig();
    const topicId = weakTopic(rig, "cloroplastos");
    const material = trainingMaterial(rig.core.registry.open(rig.workspaceId).connection, topicId);
    expect(material.topicName).toBe("cloroplastos");
    const ids = material.chunks.map((c) => c.id);
    // The question missed twice outranks the card missed once; the text match comes last.
    expect(ids).toEqual([rig.chunkIds[1], rig.chunkIds[2], rig.chunkIds[0]]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(MAX_CHUNKS);
    expect(new Set(material.avoid)).toEqual(new Set(["Card existente?", "Questão existente?"]));
    expect(material.chunks.every((c) => c.materialTitle === "Biologia")).toBe(true);
  });

  it("does not repeat a chunk found by both the mistakes and the search", () => {
    rig = generationRig();
    const topicId = weakTopic(rig, "glicose");
    const ids = trainingMaterial(
      rig.core.registry.open(rig.workspaceId).connection,
      topicId,
    ).chunks.map((c) => c.id);
    expect(ids).toEqual([rig.chunkIds[1], rig.chunkIds[2]]);
  });

  it("falls back to the chunks of the topic's own items when nothing was missed and the name finds nothing", () => {
    rig = generationRig();
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const topicId = db.insert(topic).values({ name: "Xyzzy" }).returning({ id: topic.id }).get().id;
    const run = db
      .insert(generationRun)
      .values({ kind: "card", subtype: "qa", model: "m", requested: 1 })
      .returning({ id: generationRun.id })
      .get().id;
    db.insert(item)
      .values({
        runId: run,
        kind: "card",
        subtype: "qa",
        status: "approved",
        topicId,
        chunkId: rig.chunkIds[0] as number,
        payloadJson: JSON.stringify({ front: "Card?", back: "R" }),
      })
      .run();
    const ids = trainingMaterial(
      rig.core.registry.open(rig.workspaceId).connection,
      topicId,
    ).chunks.map((c) => c.id);
    expect(ids).toEqual([rig.chunkIds[0]]);
  });

  it("rejects an unknown topic", () => {
    rig = generationRig();
    expect(() =>
      trainingMaterial(rig?.core.registry.open(rig.workspaceId).connection as never, 99),
    ).toThrowError(/Não existe tópico/);
  });
});

describe("generation on a weak topic (FR-17)", () => {
  it("forces the topic and tells the model what already exists", async () => {
    const provider = scriptedCardProvider();
    rig = generationRig({ provider });
    const topicId = weakTopic(rig);
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({ subtype: "qa", quantity: 3, kind: "card", topicId });
    expect([run.topicId, run.materialId]).toEqual([topicId, null]);
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(generation.get(run.id)).toMatchObject({ status: "done", generated: 3 });
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const created = db
      .select()
      .from(item)
      .all()
      .filter((i) => i.runId === run.id);
    expect(new Set(created.map((i) => i.topicId))).toEqual(new Set([topicId]));
    expect(
      db
        .select()
        .from(topic)
        .all()
        .map((t) => t.name),
    ).toEqual(["Glicose"]);
    const prompt = provider.calls[0]?.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("do not repeat them");
    expect(prompt).toContain("- Card existente?");
    expect(prompt.indexOf(`[excerpt ${rig.chunkIds[1]} `)).toBeGreaterThan(-1);
    expect(prompt.indexOf(`[excerpt ${rig.chunkIds[1]} `)).toBeLessThan(
      prompt.indexOf(`[excerpt ${rig.chunkIds[2]} `),
    );
  });

  it("uses the judge for question training and keeps the topic", async () => {
    rig = generationRig();
    const topicId = weakTopic(rig);
    const generation = rig.core.generation(rig.workspaceId);
    const run = generation.start({
      subtype: "certo_errado",
      quantity: 3,
      kind: "question",
      topicId,
    });
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(generation.get(run.id)).toMatchObject({ status: "done", generated: 3, topicId });
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    expect(
      new Set(
        db
          .select()
          .from(item)
          .all()
          .filter((i) => i.runId === run.id)
          .map((i) => i.topicId),
      ),
    ).toEqual(new Set([topicId]));
  });

  it("validates training requests", () => {
    rig = generationRig();
    const generation = rig.core.generation(rig.workspaceId);
    expect(() => generation.start({ subtype: "qa", quantity: 5, kind: "card" })).toThrowError(
      expect.objectContaining({ fields: [expect.objectContaining({ field: "materialId" })] }),
    );
    expect(() =>
      generation.start({ subtype: "qa", quantity: 5, kind: "card", topicId: 99 }),
    ).toThrowError(expect.objectContaining({ code: "TOPIC_NOT_FOUND" }));
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const lonely = db
      .insert(topic)
      .values({ name: "Sem material zzz" })
      .returning({ id: topic.id })
      .get().id;
    expect(() =>
      generation.start({ subtype: "qa", quantity: 5, kind: "card", topicId: lonely }),
    ).toThrowError(/trechos de origem/);
    expect(generation.listRuns()).toEqual([]);
  });

  it("estimates a training run without calling the model", () => {
    const provider = new FakeProvider();
    rig = generationRig({ provider });
    const topicId = weakTopic(rig);
    const estimate = rig.core.generation(rig.workspaceId).estimate({
      subtype: "qa",
      quantity: 10,
      kind: "card",
      topicId,
    });
    expect(estimate.chunks).toBe(2);
    expect(estimate.batches).toBeGreaterThan(0);
    expect(provider.calls).toHaveLength(0);
  });
});
