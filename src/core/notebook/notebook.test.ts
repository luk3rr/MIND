/*
 * Filename: notebook.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generationRun, item, reviewLog } from "../db/workspace-schema.js";
import { Rating } from "../study/scheduler.js";
import { World } from "../test/world.js";
import { errorCardText } from "./service.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const setup = (): World => (world = new World());
const notebook = (w: World) => w.rig.core.notebook(w.workspaceId);

const MC = {
  statement: "Qual organela faz a respiração celular?",
  options: [
    { key: "A", text: "Núcleo", why: "x" },
    { key: "B", text: "Mitocôndria", why: "y" },
  ],
  answer: "B",
  explanation: "A mitocôndria respira.",
};
const TF = {
  statement: "O núcleo faz a respiração celular.",
  options: [
    { key: "C", text: "Certo", why: "" },
    { key: "E", text: "Errado", why: "" },
  ],
  answer: "E",
  explanation: "Quem respira é a mitocôndria.",
};

function question(
  w: World,
  payload: unknown = MC,
  options: { status?: string; topic?: string | null } = {},
) {
  const topicName = options.topic === undefined ? "Células" : options.topic;
  const topicId = topicName
    ? w.db.select().from(item).all().length >= 0
      ? findOrCreate(w, topicName)
      : null
    : null;
  return w.item("question", topicId, {
    payload,
    subtype: "multiple_choice",
    ...(options.status ? { status: options.status } : {}),
  });
}

function findOrCreate(w: World, name: string): number {
  const existing = w.rig.core
    .topics(w.workspaceId)
    .list()
    .find((t) => t.name === name);
  return existing?.id ?? w.topic(name);
}

describe("error card text (golden values from the Python implementation)", () => {
  const golden = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "stats.json"), "utf8"),
  ) as { errorCards: Record<string, string[]>; errorCardPayloads: Record<string, never> };

  it.each([
    ["multiple_choice", "multiple_choice"],
    ["certo_errado_false", "certo_errado"],
    ["certo_errado_true", "certo_errado"],
  ])("builds the %s card with identical text", (name, subtype) => {
    expect(errorCardText(subtype, golden.errorCardPayloads[name] as never)).toEqual(
      golden.errorCards[name],
    );
  });

  it("builds a QA card with options and the right answer for multiple choice", () => {
    expect(errorCardText("multiple_choice", MC)).toEqual([
      "qa",
      "Qual organela faz a respiração celular?\n\nA) Núcleo\nB) Mitocôndria",
      "Resposta: B) Mitocôndria\n\nA mitocôndria respira.",
    ]);
  });

  it.each([
    ["C", "Verdadeiro"],
    ["E", "Falso"],
  ])("starts the true/false back with the verdict for %s", (answer, verdict) => {
    const [subtype, front, back] = errorCardText("certo_errado", { ...TF, answer });
    expect([subtype, front]).toEqual(["true_false", TF.statement]);
    expect(back.startsWith(`${verdict}. `)).toBe(true);
  });
});

describe("ErrorNotebook.createCard (FR-15)", () => {
  it("only lets missed, approved questions become cards", () => {
    const w = setup();
    const unanswered = question(w);
    const rightOnly = question(w);
    const draft = question(w, MC, { status: "draft" });
    w.attempts(rightOnly, [true]);
    for (const id of [unanswered, rightOnly])
      expect(() => notebook(w).createCard(id)).toThrowError(/errou/);
    w.attempts(draft, [false]);
    expect(() => notebook(w).createCard(draft)).toThrowError(/aprovadas/);
    expect(() => notebook(w).createCard(999)).toThrowError(/Não existe questão/);
    expect(() => notebook(w).createCard(w.item("card", null))).toThrowError(/Não existe questão/);
  });

  it("hangs the card on a run of the material of the question, so it shows that material", () => {
    const w = setup();
    const id = question(w);
    w.db.update(generationRun).set({ materialId: w.rig.materialId }).run();
    w.attempts(id, [false]);
    const created = notebook(w).createCard(id);
    const entry = w.rig.core
      .review(w.workspaceId)
      .catalog()
      .find((candidate) => candidate.id === created.itemId);
    expect(entry).toMatchObject({ origin: "error_note", materialId: w.rig.materialId });
  });

  it("creates an approved card that keeps the source and the topic", () => {
    const w = setup();
    const id = question(w);
    w.attempts(id, [false]);
    const created = notebook(w).createCard(id);
    expect(created.created).toBe(true);
    const card = w.db
      .select()
      .from(item)
      .all()
      .find((i) => i.id === created.itemId);
    const original = w.db
      .select()
      .from(item)
      .all()
      .find((i) => i.id === id);
    expect(card).toMatchObject({
      kind: "card",
      subtype: "qa",
      status: "approved",
      origin: "error_note",
      originItemId: id,
      sourceTitle: "Aula",
      sourcePage: 7,
      quote: "a mitocôndria é a organela responsável",
    });
    expect(card?.topicId).toBe(original?.topicId);
    expect(card?.approvedAt).not.toBeNull();
    expect(notebook(w).cardFor(id)).toBe(created.itemId);
    expect(notebook(w).cardFor(999)).toBeNull();
  });

  it("returns the same card when asked twice and keeps a single notebook run", () => {
    const w = setup();
    const ids = [question(w), question(w, { ...MC, statement: "Outra questão?" })];
    for (const id of ids) w.attempts(id, [false]);
    const first = notebook(w).createCard(ids[0] as number);
    const second = notebook(w).createCard(ids[0] as number);
    expect([second.itemId, second.created]).toEqual([first.itemId, false]);
    notebook(w).createCard(ids[1] as number);
    expect(notebook(w).entries()).toHaveLength(2);
    const runs = w.db
      .select()
      .from(generationRun)
      .all()
      .filter((r) => r.kind === "notebook");
    expect(runs).toHaveLength(1);
    expect([runs[0]?.subtype, runs[0]?.status]).toEqual(["error_note", "done"]);
  });
});

describe("ErrorNotebook.entries", () => {
  it("lists cards rated Errei without creating anything", () => {
    const w = setup();
    const ids = [0, 1].map((n) =>
      w.item("card", null, { payload: { front: `Card ${n}?`, back: "R" } }),
    );
    const study = w.rig.core.study(w.workspaceId);
    study.rate(ids[0] as number, Rating.AGAIN);
    w.clock.advance(60_000);
    study.rate(ids[0] as number, Rating.AGAIN);
    study.rate(ids[1] as number, Rating.GOOD);
    const entries = notebook(w).entries();
    expect(entries.map((e) => [e.itemId, e.failures, e.fromQuestion])).toEqual([
      [ids[0], 2, false],
    ]);
    expect(entries[0]?.front).toBe("Card 0?");
    expect(notebook(w).counts().failedCards).toBe(1);
    expect(w.db.select().from(item).all()).toHaveLength(2);
  });

  it("combines both sources, filters by topic and orders the newest first", () => {
    const w = setup();
    const id = question(w, MC, { topic: "Células" });
    w.attempts(id, [false]);
    const made = notebook(w).createCard(id);
    w.db
      .insert(reviewLog)
      .values({
        itemId: made.itemId,
        rating: 1,
        // Far ahead of the attempt above (made at the real current time), so it is the newest.
        reviewedAt: "2999-01-01T00:00:00.000Z",
        day: "2999-01-01",
      })
      .run();
    w.item("card", null, { payload: { front: "Sem tópico?", back: "R" } });
    const loose = w.db.select().from(item).all().at(-1);
    w.db.update(item).set({ origin: "error_note" }).run();
    expect(loose?.origin).toBe("generated");
    const all = notebook(w).entries();
    expect(all).toHaveLength(2);
    expect(all[0]?.front.startsWith("Qual organela")).toBe(true);
    expect(all[0]?.failures).toBe(1);
    const topicId = w.rig.core.topics(w.workspaceId).list()[0]?.id as number;
    expect(
      notebook(w)
        .entries(topicId)
        .map((e) => e.itemId),
    ).toEqual([made.itemId]);
    expect(notebook(w).counts()).toEqual({ total: 2, fromQuestions: 2, failedCards: 1 });
  });
});
