/*
 * Filename: item-images.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QuestionDraft } from "../authoring/service.js";
import { item } from "../db/workspace-schema.js";
import { errorCardImages } from "../notebook/service.js";
import { questionView } from "../practice/service.js";
import { FakeProvider } from "../llm/fake.js";
import { generationRig } from "../test/generation-fixture.js";
import { World } from "../test/world.js";
import { beforeAnswer, cleanImages, textOrImage } from "./refs.js";
import type { ImageRef } from "./refs.js";

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const fixture = (name: string): Buffer => readFileSync(join(import.meta.dirname, "fixtures", name));

/** Stores a picture and returns its reference. */
function store(w: World, name = "square.png"): ImageRef {
  const result = w.rig.core.images(w.workspaceId).put({ bytes: fixture(name) });
  if (!result.stored) throw new Error("not stored");
  return result.ref;
}

const question = (images: QuestionDraft["images"], overrides: Partial<QuestionDraft> = {}) =>
  ({
    kind: "question",
    subtype: "multiple_choice",
    statement: "Observe o gráfico.",
    options: [
      { key: "A", text: "", why: "Porque sim." },
      { key: "B", text: "Texto B", why: "Porque não." },
    ],
    answer: "A",
    explanation: "Veja a figura.",
    images,
    ...overrides,
  }) satisfies QuestionDraft;

describe("helpers", () => {
  it("keeps only the statement and the options before the answer", () => {
    const ref = { hash: "a".repeat(64) };
    expect(
      beforeAnswer({ statement: [ref], "option.A": [ref], explanation: [ref], front: [ref] }),
    ).toEqual({ statement: [ref], "option.A": [ref] });
    expect(beforeAnswer({ explanation: [ref] })).toBeUndefined();
    expect(cleanImages({ front: [] })).toBeUndefined();
    expect(textOrImage("  ", { front: [ref] }, "front")).toBe("[imagem]");
    expect(textOrImage("  ", {}, "front")).toBe("  ");
  });
});

describe("a field may be only a picture (FR-3)", () => {
  it("accepts a card whose back is only a picture, and still refuses an empty one", () => {
    const w = (world = new World());
    const authoring = w.rig.core.authoring(w.workspaceId);
    const ref = store(w);
    const created = authoring.create({
      draft: {
        kind: "card",
        subtype: "qa",
        front: "Que figura é esta?",
        back: "",
        images: { back: [ref] },
      },
      topic: null,
      origin: "manual",
    });
    expect(created.itemId).toBeGreaterThan(0);
    expect(() =>
      authoring.create({
        draft: { kind: "card", subtype: "qa", front: "Pergunta", back: "" },
        topic: null,
        origin: "manual",
      }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it("accepts an alternative that is only a picture but keeps asking for its reason", () => {
    const w = (world = new World());
    const authoring = w.rig.core.authoring(w.workspaceId);
    const ref = store(w);
    const images = { "option.A": [ref] };
    expect(
      authoring.create({ draft: question(images), topic: null, origin: "manual" }).itemId,
    ).toBeGreaterThan(0);
    const noReason = question(images, {
      options: [
        { key: "A", text: "", why: "" },
        { key: "B", text: "B", why: "x" },
      ],
    });
    expect(() => authoring.create({ draft: noReason, topic: null, origin: "manual" })).toThrowError(
      expect.objectContaining({ fields: [expect.objectContaining({ field: "options.0.why" })] }),
    );
  });

  it("refuses an alternative with neither text nor picture", () => {
    const w = (world = new World());
    expect(() =>
      w.rig.core
        .authoring(w.workspaceId)
        .create({ draft: question({}), topic: null, origin: "manual" }),
    ).toThrowError(
      expect.objectContaining({ fields: [expect.objectContaining({ field: "options.0.text" })] }),
    );
  });

  it("tells two pictures apart: only the same picture counts as a repeated alternative", () => {
    const w = (world = new World());
    const authoring = w.rig.core.authoring(w.workspaceId);
    const first = store(w, "square.png");
    const second = store(w, "photo.jpg");
    const both = (a: ImageRef, b: ImageRef) =>
      question(
        { "option.A": [a], "option.B": [b] },
        {
          options: [
            { key: "A", text: "", why: "x" },
            { key: "B", text: "", why: "y" },
          ],
        },
      );
    expect(
      authoring.create({ draft: both(first, second), topic: null, origin: "manual" }).itemId,
    ).toBeGreaterThan(0);
    expect(() =>
      authoring.create({ draft: both(first, first), topic: null, origin: "manual" }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
});

describe("editing the pictures of an item (FR-2)", () => {
  it("replaces the pictures, keeps them when none are sent and removes them with an empty map", () => {
    const w = (world = new World());
    const ref = store(w);
    const { itemId } = w.rig.core.authoring(w.workspaceId).create({
      draft: { kind: "card", subtype: "qa", front: "F", back: "B", images: { front: [ref] } },
      topic: null,
      origin: "manual",
    });
    const review = w.rig.core.review(w.workspaceId);
    expect(review.edit(itemId, "F2", "B", null).images).toEqual({ front: [ref] });
    const other = store(w, "photo.jpg");
    expect(
      review.edit(itemId, "F2", "B", null, { images: { front: [ref, { ...other, alt: "x" }] } })
        .images,
    ).toEqual({ front: [ref, { ...other, alt: "x" }] });
    expect(review.edit(itemId, "F2", "B", null, { images: {} }).images).toEqual({});
    const payload = JSON.parse(
      w.db
        .select()
        .from(item)
        .all()
        .find((row) => row.id === itemId)?.payloadJson ?? "{}",
    );
    expect(payload).not.toHaveProperty("images");
  });

  it("lets an edited card have only a picture on its front, and refuses a picture that is gone", () => {
    const w = (world = new World());
    const ref = store(w);
    const { itemId } = w.rig.core.authoring(w.workspaceId).create({
      draft: { kind: "card", subtype: "qa", front: "F", back: "B" },
      topic: null,
      origin: "manual",
    });
    const review = w.rig.core.review(w.workspaceId);
    expect(review.edit(itemId, "", "B", null, { images: { front: [ref] } }).front).toBe("");
    const bare = w.rig.core.authoring(w.workspaceId).create({
      draft: { kind: "card", subtype: "qa", front: "F", back: "B" },
      topic: null,
      origin: "manual",
    });
    expect(() => review.edit(bare.itemId, "", "B", null)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() =>
      review.edit(itemId, "F", "B", null, { images: { front: [{ hash: "d".repeat(64) }] } }),
    ).toThrowError(expect.objectContaining({ code: "IMAGE_NOT_FOUND" }));
  });
});

describe("practice does not leak the comment's pictures (FR-9)", () => {
  it("shows the statement and the options before the answer and everything after", () => {
    const w = (world = new World());
    const statement = store(w, "square.png");
    const option = store(w, "photo.jpg");
    const comment = store(w, "still.gif");
    const { itemId } = w.rig.core.authoring(w.workspaceId).create({
      draft: question({
        statement: [statement],
        "option.A": [option],
        explanation: [comment],
      }),
      topic: null,
      origin: "manual",
    });
    const practice = w.rig.core.practice(w.workspaceId);
    const next = practice.nextQuestion();
    if (!next) throw new Error("no question");
    const view = questionView(next.item);
    expect(view.images).toEqual({ statement: [statement], "option.A": [option] });
    expect(JSON.stringify(view)).not.toContain(comment.hash);
    const result = practice.answer(itemId, "A");
    const [feedback] = practice.feedback([result.attemptId]);
    expect(feedback?.images).toEqual({
      statement: [statement],
      "option.A": [option],
      explanation: [comment],
    });
  });
});

describe("the error notebook keeps the pictures", () => {
  it("puts the statement's and the options' on the card front and the comment's on its back", () => {
    const a = { hash: "a".repeat(64) };
    const b = { hash: "b".repeat(64) };
    const c = { hash: "c".repeat(64) };
    expect(
      errorCardImages({
        statement: "s",
        explanation: "e",
        answer: "A",
        options: [],
        images: { statement: [a], "option.B": [b], explanation: [c] },
      }),
    ).toEqual({ front: [a, b], back: [c] });
    expect(
      errorCardImages({ statement: "s", explanation: "e", answer: "A", options: [] }),
    ).toBeUndefined();
  });
});

describe("the assistant never sends pictures to the model (FR-18)", () => {
  it("builds the request from the text fields only", async () => {
    const fake = new FakeProvider({ promptTokens: 1, completionTokens: 1, costUsd: 0 });
    fake.script("AssistCard", { front: "Pergunta melhor?", back: "Resposta." });
    const rig = generationRig({ provider: fake });
    try {
      const hash = "e".repeat(64);
      await rig.core.assist.improve({
        action: "improve",
        draft: {
          kind: "card",
          subtype: "qa",
          front: "Pergunta?",
          back: "Resposta",
          images: { front: [{ hash, alt: "legenda secreta" }] },
        },
      });
      const sent = JSON.stringify(fake.calls[0]?.messages);
      expect(sent).toContain("Pergunta?");
      expect(sent).not.toContain(hash);
      expect(sent).not.toContain("legenda secreta");
    } finally {
      await rig.core.close();
    }
  });
});
