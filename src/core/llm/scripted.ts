/*
 * Filename: scripted.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { FakeProvider } from "./fake.js";
import type { Usage } from "./types.js";

interface Excerpt {
  id: number;
  text: string;
}

const EXCERPT =
  /\[excerpt (\d+) \| [^\]]*\]\n([\s\S]*?)(?=\n\n\[excerpt |\n\nItems that already exist|$)/g;

function parseExcerpts(prompt: string): Excerpt[] {
  return [...prompt.matchAll(EXCERPT)].map((match) => ({
    id: Number(match[1]),
    text: (match[2] as string).trim(),
  }));
}

/**
 * A provider that never touches the network and writes plausible cards from the excerpts of the
 * prompt, quoting them verbatim. Used by offline end-to-end runs and by tests.
 */
export function scriptedCardProvider(usage?: Usage, latencyMs = 0): FakeProvider {
  const provider = new FakeProvider(usage, latencyMs);
  provider.script("CardBatch", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const count = Number(/Create exactly (\d+) flashcards/.exec(prompt)?.[1] ?? 1);
    const subtype = /`subtype` = "(\w+)"/.exec(prompt)?.[1] ?? "qa";
    const excerpts = parseExcerpts(prompt);
    const cards = Array.from({ length: count }, (_, index) => {
      const excerpt = excerpts[index % Math.max(excerpts.length, 1)] ?? { id: 0, text: "" };
      const quote = excerpt.text.slice(0, 60);
      const subject = excerpt.text.split(/\s+/).slice(0, 4).join(" ");
      const front =
        subtype === "cloze"
          ? `{{c1::${subject}}} aparece no trecho ${index + 1}.`
          : `O que o trecho ${excerpt.id} diz sobre ${subject} (${index + 1})?`;
      const back =
        subtype === "true_false" ? "Verdadeiro, conforme o trecho." : "Veja o trecho citado.";
      return {
        subtype,
        front,
        back: subtype === "cloze" ? "" : back,
        topic: "Tópico de teste",
        source: { chunk_id: excerpt.id, quote },
      };
    });
    return { cards };
  });
  provider.script("QuestionBatch", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const count = Number(/Create exactly (\d+) questions/.exec(prompt)?.[1] ?? 1);
    const choices = /exactly (\d) options/.exec(prompt)?.[1];
    const excerpts = parseExcerpts(prompt);
    const questions = Array.from({ length: count }, (_, index) => {
      const excerpt = excerpts[index % Math.max(excerpts.length, 1)] ?? { id: 0, text: "" };
      const quote = excerpt.text.slice(0, 60);
      const subject = excerpt.text.split(/\s+/).slice(0, 4).join(" ");
      const source = { chunk_id: excerpt.id, quote };
      if (!choices) {
        return {
          subtype: "certo_errado",
          statement: `Segundo o trecho ${excerpt.id}, ${subject} é citado (${index + 1}).`,
          options: [],
          answer: "C",
          explanation: "O trecho confirma a afirmação.",
          topic: "Tópico de teste",
          source,
        };
      }
      const total = Number(choices);
      const keys = "ABCDE".slice(0, total).split("");
      return {
        subtype: "multiple_choice",
        statement: `Qual alternativa descreve ${subject} (${index + 1})?`,
        options: keys.map((key) => ({
          key,
          text:
            key === "A" ? `Descrição correta do trecho ${excerpt.id}` : `Descrição errada ${key}`,
          why: key === "A" ? "Confere com o trecho." : "Não confere com o trecho.",
        })),
        answer: "A",
        explanation: "A alternativa A repete o trecho.",
        topic: "Tópico de teste",
        source,
      };
    });
    return { questions };
  });
  provider.script("JudgeBatch", (messages: readonly { content: string }[]) => {
    const total = (messages.at(-1)?.content.match(/\[question \d+\]/g) ?? []).length;
    return {
      verdicts: Array.from({ length: total }, (_, index) => ({
        index,
        supported: true,
        reason: "ok",
      })),
    };
  });
  return provider;
}
