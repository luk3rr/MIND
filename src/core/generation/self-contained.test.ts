/*
 * Filename: self-contained.test.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { cardProblem } from "./cards.js";
import { buildCardMessages } from "./prompts.js";
import { buildJudgeMessages, buildQuestionMessages } from "./question-prompts.js";
import { questionProblem } from "./questions.js";
import { dependsOnSource, withSelfContained, withSelfContainedJudge } from "./self-contained.js";

describe("dependsOnSource", () => {
  it.each([
    "Qual é a melhor alternativa segundo o comentário da questão?",
    "De acordo com o texto, o que é elasticidade?",
    "Com base na figura, qual é o ponto de equilíbrio?",
    "Conforme o trecho acima, a demanda é elástica?",
    "O que afirma a tabela apresentada?",
    "Qual a resposta da questão?",
    "Nesta questão, o que se pede?",
  ])("flags %s", (text) => {
    expect(dependsOnSource(text)).toBe(true);
  });

  it.each([
    "O que é elasticidade-preço da demanda?",
    "Quando a demanda é inelástica, a receita sobe com o preço?",
    "Segundo a teoria clássica, o que determina o preço?",
    "Uma tabela de preços pode ser usada para quê?",
    "Qual é a fórmula do juro composto?",
  ])("accepts %s", (text) => {
    expect(dependsOnSource(text)).toBe(false);
  });

  it("flags a letter of an alternative only for cards", () => {
    expect(dependsOnSource("Qual é a alternativa correta? A letra D", true)).toBe(true);
    expect(dependsOnSource("Qual é a alternativa D?", true)).toBe(true);
    expect(dependsOnSource("Qual é a alternativa D?")).toBe(false);
  });
});

describe("self-contained generation", () => {
  const card = (front: string) => ({
    subtype: "qa" as const,
    front,
    back: "A letra D.",
    topic: null,
    source: { chunk_id: 1, quote: "x".repeat(20) },
  });

  it("discards cards that lean on the source, except cloze sentences", () => {
    expect(
      cardProblem(card("Qual a alternativa correta segundo o comentário da questão?"), "qa"),
    ).toBe("not_self_contained");
    expect(cardProblem(card("O que é elasticidade?"), "qa")).toBeNull();
    const cloze = {
      ...card("Conforme o texto, a {{c1::demanda}} cai."),
      subtype: "cloze" as const,
    };
    expect(cardProblem(cloze, "cloze")).toBeNull();
  });

  it("discards questions that lean on the source", () => {
    const question = {
      subtype: "certo_errado",
      statement: "De acordo com o texto, a demanda é elástica.",
      options: [],
      answer: "C",
      explanation: "Porque sim.",
      topic: null,
      source: { chunk_id: 1, quote: "x".repeat(20) },
    };
    expect(questionProblem(question as never, "certo_errado")).toBe("not_self_contained");
    expect(
      questionProblem({ ...question, statement: "A demanda é elástica." } as never, "certo_errado"),
    ).toBeNull();
  });

  it("tells the model to write self-contained items and the judge to check it", () => {
    const chunks = [{ id: 1, label: "a", text: "t" }];
    expect(
      withSelfContained(buildQuestionMessages("certo_errado", 2, chunks))[0]?.content,
    ).toContain("fully self-contained");
    const judge = withSelfContainedJudge(
      buildJudgeMessages([{ excerpt: "e", statement: "s", options: [], answer: "C" }]),
    );
    expect(judge[0]?.content).toContain("without seeing the excerpt");
    expect(judge[1]?.content).not.toContain("without seeing the excerpt");
    const messages = withSelfContained(
      buildCardMessages("qa", 3, [{ id: 1, label: "a", text: "t" }]),
    );
    expect(messages[0]?.content).toContain("fully self-contained");
    expect(messages[1]?.content).not.toContain("fully self-contained");
  });
});
