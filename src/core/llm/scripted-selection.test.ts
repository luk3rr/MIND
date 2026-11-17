/*
 * Filename: scripted-selection.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { scriptedCardProvider } from "./scripted.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

const PASSAGE = "A fotossíntese converte a energia da luz em energia química nas plantas.";

describe("the scripted provider answers the new features offline (for the end-to-end runs)", () => {
  it("writes cards and questions from a passage that pass the same checks as a real answer", async () => {
    rig = generationRig({ provider: scriptedCardProvider() });
    const selection = rig.core.selection(rig.workspaceId);
    const request = { materialId: rig.materialId, page: 1, text: PASSAGE };
    const cards = await selection.generate({
      ...request,
      kind: "card",
      quantity: 3,
      subject: "Luz",
    });
    expect(cards.drafts).toHaveLength(3);
    expect(cards.discarded).toEqual({ noSource: 0, invalid: 0, duplicate: 0 });
    expect(cards.drafts[0]).toMatchObject({ topic: "Luz", quote: PASSAGE.slice(0, 60).trim() });
    const questions = await selection.generate({ ...request, kind: "question" });
    expect(questions.drafts).toHaveLength(2);
    expect(questions.drafts[0]?.draft).toMatchObject({ kind: "question", subtype: "certo_errado" });
    expect(questions.discarded.invalid + questions.discarded.noSource).toBe(0);
  });

  it("returns the item with a marker, whatever its kind, so a run can tell the help worked", async () => {
    rig = generationRig({ provider: scriptedCardProvider() });
    const card = await rig.core.assist.improve({
      action: "improve",
      draft: {
        kind: "card",
        subtype: "qa",
        front: "Qual a função da mitocôndria?",
        back: "Energia.",
      },
    });
    expect(card.proposal).toMatchObject({
      front: "Qual a função da mitocôndria? (revisado)",
      back: "Energia.",
    });
    const question = await rig.core.assist.improve({
      action: "fix",
      draft: {
        kind: "question",
        subtype: "multiple_choice",
        statement: "Qual organela produz ATP?",
        options: [
          { key: "A", text: "Mitocôndria", why: "Respira." },
          { key: "B", text: "Ribossomo", why: "Proteínas." },
        ],
        answer: "A",
        explanation: "Respira.",
      },
    });
    expect(question.proposal).toMatchObject({
      statement: "Qual organela produz ATP? (revisado)",
      answer: "A",
      explanation: "Respira.",
      options: [
        { key: "A", text: "Mitocôndria", why: "Respira." },
        { key: "B", text: "Ribossomo", why: "Proteínas." },
      ],
    });
    const trueFalse = await rig.core.assist.improve({
      action: "fix",
      draft: {
        kind: "question",
        subtype: "certo_errado",
        statement: "O Sol é uma estrela.",
        options: [],
        answer: "C",
        explanation: "É.",
      },
    });
    expect(trueFalse.proposal).toMatchObject({
      statement: "O Sol é uma estrela. (revisado)",
      answer: "C",
    });
  });
});
