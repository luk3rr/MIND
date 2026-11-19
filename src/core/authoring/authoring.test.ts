/*
 * Filename: authoring.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import type { AppError } from "../contracts/errors.js";
import { chunk, generationRun, item, material, topic } from "../db/workspace-schema.js";
import { eq } from "drizzle-orm";
import { TEXTS } from "../test/generation-fixture.js";
import { World } from "../test/world.js";
import type { CardDraft, QuestionDraft } from "./service.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const authoring = (w: World) => w.rig.core.authoring(w.workspaceId);

const CARD: CardDraft = {
  kind: "card",
  subtype: "qa",
  front: "  Qual a função da mitocôndria?  ",
  back: "Produzir energia.",
};

describe("ItemAuthoringService", () => {
  it("creates an approved card with the manual origin and no source", () => {
    const w = setup();
    const created = authoring(w).create({ draft: CARD, topic: null, origin: "manual" });
    const row = w.db
      .select()
      .from(item)
      .all()
      .find((r) => r.id === created.itemId);
    expect(row).toMatchObject({
      kind: "card",
      subtype: "qa",
      status: "approved",
      origin: "manual",
      chunkId: null,
      quote: "",
      sourceTitle: "",
      edited: false,
    });
    expect(row?.approvedAt).not.toBeNull();
    expect(JSON.parse(row?.payloadJson ?? "{}")).toEqual({
      front: "Qual a função da mitocôndria?",
      back: "Produzir energia.",
    });
  });

  it("hangs every item of an origin on one synthetic run that keeps its counters at zero", () => {
    const w = setup();
    const service = authoring(w);
    service.create({ draft: CARD, topic: null, origin: "manual" });
    service.create({ draft: { ...CARD, front: "Outra?" }, topic: null, origin: "manual" });
    service.create({ draft: { ...CARD, front: "Do leitor?" }, topic: null, origin: "reader" });
    const runs = w.db
      .select()
      .from(generationRun)
      .all()
      .filter((r) => r.kind !== "generation");
    const manual = runs.filter((r) => r.kind === "manual");
    expect(manual).toHaveLength(1);
    expect(runs.filter((r) => r.kind === "reader")).toHaveLength(1);
    expect(manual[0]).toMatchObject({
      generated: 0,
      approved: 0,
      approvedUnedited: 0,
      discardedReview: 0,
      status: "done",
    });
    const items = w.db
      .select()
      .from(item)
      .all()
      .filter((r) => r.origin === "manual");
    expect(new Set(items.map((r) => r.runId)).size).toBe(1);
  });

  it("keeps the synthetic runs out of the list of generations", () => {
    const w = setup();
    authoring(w).create({ draft: CARD, topic: null, origin: "manual" });
    const kinds = w.rig.core
      .generation(w.workspaceId)
      .listRuns()
      .map((r) => r.kind);
    expect(kinds).not.toContain("manual");
  });

  it("serves the new card in the study queue as a new card", () => {
    const w = setup();
    const created = authoring(w).create({ draft: CARD, topic: null, origin: "manual" });
    const ids = new Set<number>();
    const study = w.rig.core.study(w.workspaceId);
    for (let i = 0; i < 50; i += 1) {
      const next = study.nextCard();
      if (!next) break;
      ids.add(next.item.id);
      if (next.item.id === created.itemId) break;
      study.rate(next.item.id, 3);
    }
    expect(ids.has(created.itemId)).toBe(true);
  });

  it("reuses a topic of the same name and tells when it created one", () => {
    const w = setup();
    const service = authoring(w);
    const first = service.create({ draft: CARD, topic: "  Biologia   celular ", origin: "manual" });
    const second = service.create({
      draft: { ...CARD, front: "Segunda?" },
      topic: "biologia celular",
      origin: "manual",
    });
    expect(first.topicCreated).toBe(true);
    expect(second.topicCreated).toBe(false);
    const topics = w.db.select().from(topic).all();
    expect(topics.filter((t) => t.name === "Biologia celular")).toHaveLength(1);
    const rows = w.db
      .select()
      .from(item)
      .all()
      .filter((r) => r.origin === "manual");
    expect(new Set(rows.map((r) => r.topicId)).size).toBe(1);
  });

  it("refuses empty fields with one message per field and saves nothing", () => {
    const w = setup();
    const before = w.db.select().from(item).all().length;
    const attempt = (draft: CardDraft): AppError => {
      try {
        authoring(w).create({ draft, topic: null, origin: "manual" });
      } catch (error) {
        return error as AppError;
      }
      throw new Error("expected a validation error");
    };
    expect(attempt({ ...CARD, front: "   " }).fields?.[0]?.field).toBe("front");
    expect(attempt({ ...CARD, back: "" }).fields?.[0]?.field).toBe("back");
    expect(attempt({ ...CARD, subtype: "cloze", front: "Sem lacuna" }).fields?.[0]?.field).toBe(
      "front",
    );
    expect(attempt({ ...CARD, subtype: "true_false", back: "Talvez" }).fields?.[0]?.field).toBe(
      "back",
    );
    expect(w.db.select().from(item).all()).toHaveLength(before);
    expect(
      w.db
        .select()
        .from(generationRun)
        .all()
        .some((r) => r.kind === "manual"),
    ).toBe(false);
  });
});

const MC: QuestionDraft = {
  kind: "question",
  subtype: "multiple_choice",
  statement: "  Qual organela produz a maior parte do ATP?  ",
  options: [
    { key: "A", text: "Mitocôndria", why: " Faz a respiração celular. " },
    { key: "B", text: "Ribossomo", why: "Sintetiza proteínas." },
    { key: "C", text: "Lisossomo", why: "Digere material." },
  ],
  answer: "A",
  explanation: " A mitocôndria concentra a cadeia respiratória. ",
};

const TF: QuestionDraft = {
  kind: "question",
  subtype: "certo_errado",
  statement: "O núcleo faz a respiração celular.",
  options: [],
  answer: "E",
  explanation: "Quem respira é a mitocôndria.",
};

function refusal(w: World, draft: QuestionDraft): AppError {
  try {
    authoring(w).create({ draft, topic: null, origin: "manual" });
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected a validation error");
}

describe("ItemAuthoringService questions", () => {
  it("creates an approved multiple choice question that practice serves (FR-2, FR-3)", () => {
    const w = setup();
    const created = authoring(w).create({ draft: MC, topic: "Células", origin: "manual" });
    const row = w.db
      .select()
      .from(item)
      .all()
      .find((r) => r.id === created.itemId);
    expect(row).toMatchObject({
      kind: "question",
      subtype: "multiple_choice",
      status: "approved",
      origin: "manual",
      chunkId: null,
    });
    expect(JSON.parse(row?.payloadJson ?? "{}")).toEqual({
      statement: "Qual organela produz a maior parte do ATP?",
      options: [
        { key: "A", text: "Mitocôndria", why: "Faz a respiração celular." },
        { key: "B", text: "Ribossomo", why: "Sintetiza proteínas." },
        { key: "C", text: "Lisossomo", why: "Digere material." },
      ],
      answer: "A",
      explanation: "A mitocôndria concentra a cadeia respiratória.",
    });
    const next = w.rig.core.practice(w.workspaceId).nextQuestion();
    expect(next?.item.id).toBe(created.itemId);
    expect(next?.item.answer).toBe("A");
  });

  it("stores true or false with the fixed Certo and Errado options", () => {
    const w = setup();
    const created = authoring(w).create({ draft: TF, topic: null, origin: "manual" });
    const row = w.db
      .select()
      .from(item)
      .all()
      .find((r) => r.id === created.itemId);
    expect(JSON.parse(row?.payloadJson ?? "{}")).toMatchObject({
      options: [
        { key: "C", text: "Certo", why: "" },
        { key: "E", text: "Errado", why: "" },
      ],
      answer: "E",
    });
  });

  it("names the field at fault and saves nothing for each broken rule (FR-2)", () => {
    const w = setup();
    const before = w.db.select().from(item).all().length;
    const field = (draft: QuestionDraft) => refusal(w, draft).fields?.[0]?.field;
    expect(field({ ...MC, statement: " " })).toBe("statement");
    expect(field({ ...MC, explanation: "" })).toBe("explanation");
    expect(field({ ...MC, options: MC.options.slice(0, 1), answer: "A" })).toBe("options");
    expect(
      field({ ...MC, options: MC.options.map((o, i) => ({ ...o, key: "BCD"[i] ?? "" })) }),
    ).toBe("options");
    expect(
      field({ ...MC, options: MC.options.map((o, i) => (i === 1 ? { ...o, text: " " } : o)) }),
    ).toBe("options.1.text");
    expect(
      field({ ...MC, options: MC.options.map((o, i) => (i === 2 ? { ...o, why: "" } : o)) }),
    ).toBe("options.2.why");
    expect(
      field({
        ...MC,
        options: MC.options.map((o, i) => (i === 2 ? { ...o, text: "mitocôndria" } : o)),
      }),
    ).toBe("options.2.text");
    expect(field({ ...MC, answer: "D" })).toBe("answer");
    expect(field({ ...TF, answer: "A" })).toBe("answer");
    expect(field({ ...TF, options: MC.options })).toBe("options");
    expect(w.db.select().from(item).all()).toHaveLength(before);
  });

  it("lists the origin and the missing source of items written by hand (FR-19)", () => {
    const w = setup();
    authoring(w).create({ draft: MC, topic: null, origin: "manual" });
    authoring(w).create({ draft: CARD, topic: null, origin: "reader" });
    const catalog = w.rig.core.review(w.workspaceId).catalog();
    const manual = catalog.find((entry) => entry.origin === "manual");
    expect(manual).toMatchObject({
      kind: "question",
      material: null,
      materialId: null,
      sourceTitle: "",
      sourcePage: null,
      hasPdf: false,
    });
    expect(catalog.some((entry) => entry.origin === "reader")).toBe(true);
  });

  it("keeps the run counters at zero for questions too (NFR-4)", () => {
    const w = setup();
    authoring(w).create({ draft: MC, topic: null, origin: "manual" });
    const run = w.db
      .select()
      .from(generationRun)
      .all()
      .find((r) => r.kind === "manual");
    expect(run).toMatchObject({ approved: 0, approvedUnedited: 0, generated: 0 });
  });
});

describe("ItemAuthoringService sources", () => {
  const asPdf = (w: World): void => {
    w.db.update(material).set({ kind: "pdf" }).where(eq(material.id, w.rig.materialId)).run();
  };

  it("finds a quote in the chunk of its page, ignoring spacing and case (FR-4)", () => {
    const w = setup();
    const found = authoring(w).resolveSource({
      materialId: w.rig.materialId,
      page: 2,
      text: "  LIBERA   energia armazenada nas moléculas  ",
    });
    expect(found).toEqual({
      match: "full",
      chunkId: w.rig.chunkIds[1],
      quote: "LIBERA   energia armazenada nas moléculas",
      materialTitle: "Biologia",
    });
  });

  it("keeps the longest beginning that is in the material when the rest is not (ADR-4)", () => {
    const w = setup();
    const found = authoring(w).resolveSource({
      materialId: w.rig.materialId,
      page: 2,
      text: "A respiração celular libera energia armazenada e depois algo que não está lá",
    });
    expect(found.match).toBe("partial");
    expect(found.chunkId).toBe(w.rig.chunkIds[1]);
    expect(TEXTS[1]).toContain(found.quote.slice(0, 30));
    expect(found.quote.length).toBeGreaterThanOrEqual(15);
    expect(found.quote).not.toContain("depois");
  });

  it("does not match text of another page, text that is too short or text that is absent", () => {
    const w = setup();
    const resolve = (page: number | null, text: string) =>
      authoring(w).resolveSource({ materialId: w.rig.materialId, page, text });
    expect(resolve(1, "A respiração celular libera energia")).toMatchObject({
      match: "none",
      chunkId: null,
      quote: "A respiração celular libera energia",
    });
    expect(resolve(2, "A resp. Nada a ver com o texto")).toMatchObject({ match: "none" });
    expect(resolve(2, "texto inexistente neste material")).toMatchObject({ match: "none" });
    expect(resolve(null, "A respiração celular libera energia")).toMatchObject({ match: "none" });
  });

  it("looks at chunks without a page when the material has none", () => {
    const w = setup();
    const id = w.db
      .insert(material)
      .values({
        title: "Texto",
        kind: "text",
        filename: "t.md",
        storedPath: "x",
        status: "indexed",
      })
      .returning({ id: material.id })
      .get().id;
    w.db
      .insert(chunk)
      .values({
        materialId: id,
        ordinal: 0,
        page: null,
        section: null,
        text: "Um parágrafo sem página nenhuma.",
      })
      .run();
    expect(
      authoring(w).resolveSource({ materialId: id, page: null, text: "parágrafo sem página" }),
    ).toMatchObject({ match: "full", materialTitle: "Texto" });
  });

  it("refuses a material that does not exist", () => {
    const w = setup();
    expect(() => authoring(w).resolveSource({ materialId: 999, page: 1, text: "x" })).toThrow(
      expect.objectContaining({ code: "MATERIAL_NOT_FOUND" }),
    );
  });

  it("stores the source of an item and lets the reader open its page (FR-4, FR-20)", () => {
    const w = setup();
    asPdf(w);
    const created = authoring(w).create({
      draft: CARD,
      topic: null,
      origin: "manual",
      source: {
        materialId: w.rig.materialId,
        page: 3,
        quote: "fixa o dióxido de carbono em açúcares",
      },
    });
    expect(created.sourceLinked).toBe(true);
    const info = w.rig.core.review(w.workspaceId).get(created.itemId);
    expect(info).toMatchObject({
      chunkId: w.rig.chunkIds[2],
      sourceTitle: "Biologia",
      sourcePage: 3,
      quote: "fixa o dióxido de carbono em açúcares",
      origin: "manual",
    });
    expect(info.pdfSource).toEqual({
      materialId: w.rig.materialId,
      page: 3,
      quote: "fixa o dióxido de carbono em açúcares",
    });
  });

  it("keeps the quote but no chunk when it is not in the material, so there is no PDF shortcut", () => {
    const w = setup();
    asPdf(w);
    const created = authoring(w).create({
      draft: CARD,
      topic: null,
      origin: "manual",
      source: { materialId: w.rig.materialId, page: 3, quote: "uma frase que não existe no livro" },
    });
    expect(created.sourceLinked).toBe(false);
    const info = w.rig.core.review(w.workspaceId).get(created.itemId);
    expect(info).toMatchObject({
      chunkId: null,
      sourceTitle: "Biologia",
      sourcePage: 3,
      quote: "uma frase que não existe no livro",
    });
    expect(info.pdfSource).toBeNull();
  });

  it("gives the item the material of its source, found or not, so the catalog shows it", () => {
    const w = setup();
    asPdf(w);
    const service = authoring(w);
    const found = service.create({
      draft: CARD,
      topic: null,
      origin: "reader",
      source: {
        materialId: w.rig.materialId,
        page: 3,
        quote: "fixa o dióxido de carbono em açúcares",
      },
    });
    const missing = service.create({
      draft: { ...CARD, front: "Outra?" },
      topic: null,
      origin: "reader",
      source: { materialId: w.rig.materialId, page: 3, quote: "uma frase que não existe no livro" },
    });
    const none = service.create({
      draft: { ...CARD, front: "Sem fonte?" },
      topic: null,
      origin: "reader",
    });
    const catalog = w.rig.core.review(w.workspaceId).catalog();
    for (const id of [found.itemId, missing.itemId]) {
      expect(catalog.find((entry) => entry.id === id)).toMatchObject({
        materialId: w.rig.materialId,
        material: "Biologia",
      });
    }
    expect(catalog.find((entry) => entry.id === none.itemId)).toMatchObject({ materialId: null });
    // One run per origin and material, shared by the items of the same pair.
    const runs = w.db
      .select()
      .from(generationRun)
      .all()
      .filter((r) => r.kind === "reader");
    expect(runs.map((r) => r.materialId).sort()).toEqual([null, w.rig.materialId].sort());
  });

  it("keeps the item when its material is deleted", () => {
    const w = setup();
    const created = authoring(w).create({
      draft: CARD,
      topic: null,
      origin: "reader",
      source: {
        materialId: w.rig.materialId,
        page: 3,
        quote: "fixa o dióxido de carbono em açúcares",
      },
    });
    w.db.delete(material).where(eq(material.id, w.rig.materialId)).run();
    expect(
      w.rig.core
        .review(w.workspaceId)
        .catalog()
        .find((e) => e.id === created.itemId),
    ).toMatchObject({
      materialId: null,
    });
  });

  it("saves nothing when the material of the source does not exist", () => {
    const w = setup();
    const before = w.db.select().from(item).all().length;
    expect(() =>
      authoring(w).create({
        draft: CARD,
        topic: null,
        origin: "manual",
        source: { materialId: 999, page: 1, quote: "x" },
      }),
    ).toThrow(expect.objectContaining({ code: "MATERIAL_NOT_FOUND" }));
    expect(w.db.select().from(item).all()).toHaveLength(before);
  });
});
