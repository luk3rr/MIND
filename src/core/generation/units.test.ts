/*
 * Filename: units.test.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { chunk, material } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { allInScope } from "../llm/scripted.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import type { Role } from "../analysis/classifier.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

const quote = "converte a energia da luz em energia química";
const TEXT = `A fotossíntese ${quote} nos cloroplastos das plantas verdes.`;

/** A provider that writes one card per excerpt of the prompt, quoting it. */
function onePerExcerpt(): FakeProvider {
  const provider = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0.001 });
  provider.script("CardBatch", (messages: readonly { content: string }[]) => ({
    cards: [...(messages.at(-1)?.content.matchAll(/\[excerpt (\d+) \|/g) ?? [])].map(
      (match, index) => ({
        subtype: "qa",
        front: `Pergunta ${index + 1}?`,
        back: "Resposta.",
        topic: "Biologia",
        source: { chunk_id: Number(match[1]), quote },
      }),
    ),
  }));
  provider.script("QuestionBatch", { questions: [] });
  provider.script("RelevanceBatch", allInScope);
  return provider;
}

/** An analyzed material whose chunks have these roles and units, in order. */
function analyzedRig(layout: [Role, number][], provider = onePerExcerpt()) {
  rig = generationRig({ provider, texts: layout.map(() => TEXT) });
  const { db } = rig.core.registry.open(rig.workspaceId).connection;
  layout.forEach(([role, unit], position) => {
    db.update(chunk)
      .set({ role, unit, startsUnit: 1 })
      .where(eq(chunk.id, rig?.chunkIds[position] as number))
      .run();
  });
  db.update(material)
    .set({ analyzedAt: "2026-11-19T00:00:00.000Z" })
    .where(eq(material.id, rig.materialId))
    .run();
  return { service: rig.core.generation(rig.workspaceId), db, provider };
}

const card = (quantity = 5) => ({ subtype: "qa", quantity, kind: "card" as const });
const question = (quantity = 3) => ({
  subtype: "certo_errado",
  quantity,
  kind: "question" as const,
});

describe("the subject the prompts name (FR-1)", () => {
  const subjectLine = (provider: FakeProvider): string | undefined =>
    /Subject of the material: ([^\n]*)\./.exec(
      provider.calls.find((call) => call.schemaName === "CardBatch")?.messages.at(-1)?.content ??
        "",
    )?.[1];

  async function run(set: Partial<typeof material.$inferInsert>): Promise<string | undefined> {
    const { service, db, provider } = analyzedRig([["concept", 1]]);
    if (Object.keys(set).length > 0) {
      db.update(material)
        .set(set)
        .where(eq(material.id, rig?.materialId ?? 0))
        .run();
    }
    const started = service.start({ materialId: rig?.materialId as number, ...card(1) });
    await rig?.core.queue.wait(rig.workspaceId, started.jobId as number);
    return subjectLine(provider);
  }

  it("is the title when nothing else is known", async () => {
    expect(await run({})).toBe("Biologia");
  });

  it("is the subject the analysis found, over the title", async () => {
    expect(await run({ subjectInferred: "Biologia celular" })).toBe("Biologia celular");
  });

  it("is the subject the person named, over the one the analysis found", async () => {
    expect(await run({ subjectInferred: "Biologia celular", subjectUser: "Fotossíntese" })).toBe(
      "Fotossíntese",
    );
  });
});

describe("generation by unit and role (FR-10, FR-12)", () => {
  it("writes cards from the content only and records that the analysis was used", async () => {
    const { service, provider } = analyzedRig([
      ["other", 1],
      ["concept", 2],
      ["motivating_text", 3],
      ["exam_question", 3],
    ]);
    const started = service.start({ materialId: rig?.materialId as number, ...card(5) });
    expect(started.withAnalysis).toBe(false);
    await rig?.core.queue.wait(rig.workspaceId, started.jobId as number);
    // Only the content chunk was an excerpt; the exam question and its text are context-less here
    // (a unit with no source is dropped), and the cover is never sent.
    const sent = provider.calls.find((c) => c.schemaName === "CardBatch")?.messages.at(-1)?.content;
    expect(sent?.match(/\[excerpt /g)).toHaveLength(1);
    expect(sent).not.toContain("[context ");
    expect(service.get(started.id)).toMatchObject({ withAnalysis: true, generated: 1 });
  });

  it("explains that a material without content cannot give cards (FR-13)", () => {
    const { service } = analyzedRig([
      ["other", 1],
      ["motivating_text", 2],
      ["exam_question", 2],
    ]);
    const request = { materialId: rig?.materialId as number, ...card(5) };
    expect(() => service.estimate(request)).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ message: expect.stringMatching(/só questões/) })],
      }),
    );
    expect(() => service.start(request)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("still gives questions from a material that is only exam questions, and says so", () => {
    const { service } = analyzedRig([
      ["motivating_text", 1],
      ["exam_question", 1],
      ["commentary", 1],
      ["exam_question", 2],
    ]);
    const estimate = service.estimate({ materialId: rig?.materialId as number, ...question() });
    expect(estimate).toMatchObject({ onlyQuestions: true, chunks: 4, batches: 1 });
    // Cards come only from the teacher's comment, with the question as context.
    const cards = service.estimate({ materialId: rig?.materialId as number, ...card() });
    expect(cards).toMatchObject({ onlyQuestions: true, chunks: 3 });
  });

  it("does not call a material with content only-questions", () => {
    const { service } = analyzedRig([
      ["concept", 1],
      ["exam_question", 2],
    ]);
    expect(
      service.estimate({ materialId: rig?.materialId as number, ...question() }).onlyQuestions,
    ).toBe(false);
  });

  it("falls back to batches by size when the material was never analyzed (FR-12)", async () => {
    const provider = onePerExcerpt();
    rig = generationRig({ provider, texts: [TEXT, TEXT] });
    const service = rig.core.generation(rig.workspaceId);
    const started = service.start({ materialId: rig.materialId, ...card(5) });
    await rig.core.queue.wait(rig.workspaceId, started.jobId as number);
    const sent = provider.calls.find((c) => c.schemaName === "CardBatch")?.messages.at(-1)?.content;
    expect(sent?.match(/\[excerpt /g)).toHaveLength(2);
    expect(sent).not.toMatch(/\| (concept|worked example)\]/);
    expect(service.get(started.id)).toMatchObject({ withAnalysis: false });
    expect(service.estimate({ materialId: rig.materialId, ...card() }).onlyQuestions).toBe(false);
  });
});
