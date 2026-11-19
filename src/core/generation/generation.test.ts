/*
 * Filename: generation.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { generationRun, item, topic } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { generationRig, TEXTS } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { CardGenerator, cardProblem, cleanTopic, payloadProblem } from "./cards.js";
import { validateRequest } from "./service.js";
import type { GenerationRequest } from "./service.js";
import { selectChunks } from "./planning.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
  materialId: 1,
  subtype: "qa",
  quantity: 5,
  kind: "card",
  ...overrides,
});

function card(overrides: Record<string, unknown> = {}) {
  return {
    subtype: "qa",
    front: "O que converte luz em energia?",
    back: "A fotossíntese.",
    topic: "Biologia celular",
    source: { chunk_id: 1, quote: "converte a energia da luz em energia química" },
    ...overrides,
  };
}

function setup(cards: unknown[], texts?: string[]) {
  const provider = new FakeProvider({ promptTokens: 10, completionTokens: 5, costUsd: 0.01 });
  provider.script("CardBatch", { cards });
  rig = generationRig({ provider, ...(texts ? { texts } : {}) });
  const workspace = rig.core.registry.open(rig.workspaceId);
  const run = workspace.connection.db
    .insert(generationRun)
    .values({ kind: "card", subtype: "qa", model: "m", requested: 5 })
    .returning()
    .get();
  const generator = new CardGenerator(
    workspace.connection.db,
    workspace.connection.sqlite,
    provider,
  );
  const chunks = selectChunks(workspace.connection.db, rig.materialId);
  const batch = (extra: Partial<Parameters<CardGenerator["generateBatch"]>[0]> = {}) =>
    generator.generateBatch({
      runId: run.id,
      subtype: "qa",
      count: 3,
      chunks,
      model: "m",
      remaining: () => 5,
      ...extra,
    });
  return { workspace, batch, provider, chunks };
}

describe("card helpers", () => {
  it("finds why a card is malformed", () => {
    expect(payloadProblem("qa", " ", "b")).toBe("empty_front");
    expect(payloadProblem("qa", "f", " ")).toBe("empty_back");
    expect(payloadProblem("cloze", "sem lacuna", "")).toBe("cloze_without_gap");
    expect(payloadProblem("cloze", "texto {{c1::termo}}", "")).toBeNull();
    expect(payloadProblem("true_false", "f", "talvez")).toBe("true_false_without_verdict");
    expect(payloadProblem("true_false", "f", "Falso, porque")).toBeNull();
    expect(cardProblem({ ...card(), subtype: "cloze" } as never, "qa")).toBe("wrong_subtype");
  });

  it("cleans topics", () => {
    expect(cleanTopic("  Biologia   celular ")).toBe("Biologia celular");
    expect(cleanTopic("   ")).toBeNull();
    expect(cleanTopic(null)).toBeNull();
    expect(cleanTopic("x".repeat(200))?.length).toBe(80);
  });
});

describe("CardGenerator", () => {
  it("stores a valid card as a draft with a copied source and the batch cost", async () => {
    const { workspace, batch } = setup([card()]);
    const outcome = await batch();
    expect(outcome).toMatchObject({ accepted: 1, noSource: 0, invalid: 0, costUsd: 0.01 });
    const [stored] = workspace.connection.db.select().from(item).all();
    expect(stored).toMatchObject({
      status: "draft",
      kind: "card",
      sourceTitle: "Biologia",
      sourcePage: 1,
      quote: "converte a energia da luz em energia química",
    });
    expect(JSON.parse(stored?.payloadJson ?? "{}")).toEqual({
      front: "O que converte luz em energia?",
      back: "A fotossíntese.",
    });
  });

  it("sends only the batch excerpts and the requested model", async () => {
    const { batch, provider } = setup([card()]);
    await batch();
    const call = provider.calls[0];
    expect(call?.model).toBe("m");
    expect(call?.messages[1]?.content).toContain("Create up to 3 flashcards");
    expect(call?.messages[1]?.content).toContain("[excerpt 1 | Biologia p.1]");
  });

  it("accepts a batch with fewer cards than asked, or none (FR-3)", async () => {
    const some = setup([card()]);
    expect(await some.batch({ count: 3 })).toMatchObject({ accepted: 1, invalid: 0, noSource: 0 });
    await rig?.core.close();
    const none = setup([]);
    expect(await none.batch({ count: 3 })).toMatchObject({ accepted: 0, invalid: 0, noSource: 0 });
    expect(none.workspace.connection.db.select().from(item).all()).toHaveLength(0);
  });

  it("names the subject in the prompt only when it is known (FR-1, FR-2)", async () => {
    const { batch, provider } = setup([card()]);
    await batch({ scope: { subject: "Língua Portuguesa: acentuação" } });
    await batch({ scope: { subject: null } });
    expect(provider.calls[0]?.messages[1]?.content).toContain(
      "Subject of the material: Língua Portuguesa: acentuação.",
    );
    expect(provider.calls[1]?.messages[1]?.content).not.toContain("Subject of the material");
    // The scope test lives in the system prompt, so every batch carries it.
    expect(provider.calls[1]?.messages[0]?.content).toContain("SUBJECT of the material");
  });

  it("discards cards whose source cannot be verified and counts them", async () => {
    const { workspace, batch } = setup([
      card({ source: { chunk_id: 1, quote: "frase que não está no trecho de jeito nenhum" } }),
      card({ front: "outra", source: { chunk_id: 99, quote: "converte a energia da luz" } }),
      card({ front: "curta", source: { chunk_id: 1, quote: "luz" } }),
      card({ front: "boa" }),
    ]);
    const outcome = await batch();
    expect(outcome).toMatchObject({ accepted: 1, noSource: 3 });
    expect(outcome.log.map((entry) => entry.reason)).toEqual([
      "quote_not_in_chunk",
      "chunk_not_in_batch",
      "quote_too_short",
    ]);
    expect(workspace.connection.db.select().from(item).all()).toHaveLength(1);
  });

  it("discards malformed cards as invalid", async () => {
    const { batch } = setup([card({ front: " " }), card({ subtype: "cloze" }), card({ back: "" })]);
    expect(await batch()).toMatchObject({ accepted: 0, invalid: 3 });
  });

  it("accepts valid cloze and true/false cards", async () => {
    const cloze = setup([
      card({ subtype: "cloze", front: "A {{c1::fotossíntese}} converte luz.", back: "" }),
    ]);
    expect(await cloze.batch({ subtype: "cloze" })).toMatchObject({ accepted: 1 });
    await rig?.core.close();
    const truth = setup([
      card({
        subtype: "true_false",
        front: "Plantas fazem fotossíntese.",
        back: "Verdadeiro, no cloroplasto.",
      }),
    ]);
    expect(await truth.batch({ subtype: "true_false" })).toMatchObject({ accepted: 1 });
  });

  it("drops duplicates inside the batch and against existing items", async () => {
    const { batch } = setup([card(), card({ front: "  O QUE converte luz em energia? " })]);
    expect(await batch()).toMatchObject({ accepted: 1, duplicate: 1 });
    expect(await batch()).toMatchObject({ accepted: 0, duplicate: 2 });
  });

  it("stores only the remaining quota", async () => {
    const { batch } = setup([card({ front: "a1" }), card({ front: "a2" }), card({ front: "a3" })]);
    expect(await batch({ remaining: () => 2 })).toMatchObject({ accepted: 2 });
  });

  it("creates topics once ignoring case and spacing, or forces a topic", async () => {
    const { workspace, batch } = setup([
      card({ front: "t1", topic: "Biologia  Celular" }),
      card({ front: "t2", topic: "biologia celular" }),
      card({ front: "t3", topic: null }),
    ]);
    await batch();
    expect(workspace.connection.db.select().from(topic).all()).toHaveLength(1);
    const forced = workspace.connection.db
      .insert(topic)
      .values({ name: "Forçado" })
      .returning()
      .get();
    expect(forced.id).toBeGreaterThan(0);
  });
});

describe("validateRequest", () => {
  it("accepts a valid request and rejects bad ones naming the fields", () => {
    expect(() => validateRequest(request())).not.toThrow();
    for (const [bad, field] of [
      [{ subtype: "essay" }, "subtype"],
      [{ quantity: 0 }, "quantity"],
      [{ quantity: 61 }, "quantity"],
      [{ pageFrom: 0 }, "pageFrom"],
      [{ pageFrom: 5, pageTo: 2 }, "pageTo"],
    ] as const) {
      let error: unknown;
      try {
        validateRequest(request(bad as Partial<GenerationRequest>));
      } catch (caught) {
        error = caught;
      }
      expect((error as AppError).fields?.map((f) => f.field)).toContain(field);
    }
  });
});

describe("GenerationService", () => {
  it("generates exactly the requested drafts and tracks the run (FR-6, NFR-2)", async () => {
    rig = generationRig();
    const service = rig.core.generation(rig.workspaceId);
    const started = service.start(request({ materialId: rig.materialId, quantity: 7 }));
    expect(started).toMatchObject({ status: "queued", requested: 7, kind: "card" });
    await rig.core.queue.wait(rig.workspaceId, started.jobId as number);
    const done = service.get(started.id);
    expect(done).toMatchObject({ status: "done", generated: 7, discardedNoSource: 0 });
    const db = rig.core.registry.open(rig.workspaceId).connection.db;
    expect(db.select().from(item).all()).toHaveLength(7);
    expect(service.listRuns().map((r) => r.id)).toEqual([started.id]);
  });

  it("finishes a run that gets fewer cards than requested, with the title as the subject (FR-1, FR-3)", async () => {
    const provider = new FakeProvider();
    provider.script("CardBatch", { cards: [card({ front: "só este" })] });
    rig = generationRig({ provider, texts: [TEXTS[0] as string] });
    const service = rig.core.generation(rig.workspaceId);
    const run = service.start(request({ materialId: rig.materialId, quantity: 5 }));
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(service.get(run.id)).toMatchObject({
      status: "done",
      requested: 5,
      generated: 1,
      errorCode: null,
    });
    expect(provider.calls[0]?.messages[1]?.content).toContain("Subject of the material: Biologia.");
  });

  it("counts discard reasons on the run", async () => {
    const provider = new FakeProvider();
    provider.script("CardBatch", {
      cards: [
        card({ front: "ok" }),
        card({ front: "ruim", source: { chunk_id: 1, quote: "texto inventado pelo modelo aqui" } }),
      ],
    });
    rig = generationRig({ provider, texts: [TEXTS[0] as string] });
    const service = rig.core.generation(rig.workspaceId);
    const run = service.start(request({ materialId: rig.materialId, quantity: 2 }));
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(service.get(run.id)).toMatchObject({ generated: 1, discardedNoSource: 1 });
    expect(service.get(run.id).discardLog[0]?.reason).toBe("quote_not_in_chunk");
  });

  it("keeps partial results when the provider fails and fails the job", async () => {
    let calls = 0;
    const provider = new FakeProvider();
    provider.script("CardBatch", () => {
      calls += 1;
      if (calls === 2) throw new AppError("PROVIDER_ERROR", "O provedor falhou.");
      return { cards: [card({ front: `c${calls}` })] };
    });
    rig = generationRig({
      provider,
      concurrency: 1,
      texts: [TEXTS[0] as string, "y".repeat(6000), "z".repeat(6000)],
    });
    const service = rig.core.generation(rig.workspaceId);
    const run = service.start(request({ materialId: rig.materialId, quantity: 15 }));
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(service.get(run.id)).toMatchObject({
      status: "partial",
      errorCode: "PROVIDER_ERROR",
      generated: 1,
    });
  });

  it("cancels a running run", async () => {
    rig = generationRig({ provider: slowProvider() });
    const service = rig.core.generation(rig.workspaceId);
    const run = service.start(request({ materialId: rig.materialId, quantity: 5 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(service.cancel(run.id)).toBe(true);
    await rig.core.queue.wait(rig.workspaceId, run.jobId as number);
    expect(["cancelled", "done"]).toContain(service.get(run.id).status);
  });

  it("rejects invalid, unknown and unindexed requests before any work", () => {
    rig = generationRig();
    const service = rig.core.generation(rig.workspaceId);
    expect(() =>
      service.start(request({ materialId: rig?.materialId as number, quantity: 0 })),
    ).toThrowError(AppError);
    expect(() => service.start(request({ materialId: 999 }))).toThrowError(/Não existe material/);
    expect(() =>
      service.start(request({ materialId: rig?.materialId as number, pageFrom: 50 })),
    ).toThrowError(/Não há texto/);
    const db = rig.core.registry.open(rig.workspaceId).connection;
    db.sqlite.prepare("UPDATE material SET status = 'queued'").run();
    expect(() => service.start(request({ materialId: rig?.materialId as number }))).toThrowError(
      /ainda não foi indexado/,
    );
    expect(service.listRuns()).toEqual([]);
  });

  it("surfaces readiness errors before creating a run", () => {
    const real = generationRig({ provider: undefined });
    rig = real;
    const provider = Object.assign(new FakeProvider(), {
      requiresConsent: true,
      name: "openrouter",
    });
    const other = generationRig({ provider });
    const service = other.core.generation(other.workspaceId);
    expect(() => service.start(request({ materialId: other.materialId }))).toThrowError(
      /Configure a chave/,
    );
    other.core.llm.secrets.save("sk-or-x");
    expect(() => service.start(request({ materialId: other.materialId }))).toThrowError(
      /Aceite o envio/,
    );
    void other.core.close();
  });

  it("estimates with the cached price and reports the plan", () => {
    rig = generationRig();
    const service = rig.core.generation(rig.workspaceId);
    expect(service.estimate(request({ materialId: rig.materialId, quantity: 10 }))).toMatchObject({
      estimatedUsd: null,
      chunks: 3,
      batches: 1,
    });
    rig.core.registry.appDatabase.sqlite
      .prepare(
        "INSERT INTO model_price (model, prompt_usd_per_token, completion_usd_per_token, fetched_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        rig.core.llm.settings.get().generationModel,
        0.000001,
        0.000002,
        new Date().toISOString(),
      );
    const estimate = service.estimate(request({ materialId: rig.materialId, quantity: 10 }));
    expect(estimate.estimatedUsd).toBeGreaterThan(0);
    expect(estimate.promptChars).toBeGreaterThan(1000);
  });

  it("reports an unknown run", () => {
    rig = generationRig();
    expect(() => rig?.core.generation(rig.workspaceId).get(42)).toThrowError(/Não existe geração/);
  });
});

function slowProvider(): FakeProvider {
  const provider = new FakeProvider(undefined, 200);
  provider.script("CardBatch", { cards: [] });
  return provider;
}
