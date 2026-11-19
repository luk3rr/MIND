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

/** The relevance reviewer's answer when every card is about the subject: for tests and offline runs. */
export const allInScope = (messages: readonly { content: string }[]): unknown => {
  const total = (messages.at(-1)?.content.match(/\[card \d+\]/g) ?? []).length;
  return {
    verdicts: Array.from({ length: total }, (_, index) => ({
      index,
      in_scope: true,
      reason: "ok",
    })),
  };
};

/**
 * A provider that never touches the network and writes plausible cards from the excerpts of the
 * prompt, quoting them verbatim. Used by offline end-to-end runs and by tests.
 */
export function scriptedCardProvider(usage?: Usage, latencyMs = 0): FakeProvider {
  const provider = new FakeProvider(usage, latencyMs);
  provider.script("CardBatch", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const count = Number(/Create (?:exactly|up to) (\d+) flashcards/.exec(prompt)?.[1] ?? 1);
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
    const count = Number(/Create (?:exactly|up to) (\d+) questions/.exec(prompt)?.[1] ?? 1);
    const choices = /exactly (\d) options/.exec(prompt)?.[1];
    const calculation = prompt.includes('Question type "calculation"');
    const excerpts = parseExcerpts(prompt);
    const questions = Array.from({ length: count }, (_, index) => {
      const excerpt = excerpts[index % Math.max(excerpts.length, 1)] ?? { id: 0, text: "" };
      const quote = excerpt.text.slice(0, 60);
      const subject = excerpt.text.split(/\s+/).slice(0, 4).join(" ");
      const source = { chunk_id: excerpt.id, quote };
      if (calculation) {
        // A compound-interest problem whose numbers change with the question number.
        const capital = 1000 * (index + 1);
        const years = 2 + (index % 3);
        const result = capital * 1.1 ** years;
        const total = Number(choices ?? 4);
        const keys = "ABCDE".slice(0, total).split("");
        const values = keys.map((_, slot) => (slot === 0 ? result : result * (1 + slot * 0.07)));
        const brl = (value: number): string =>
          `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return {
          subtype: "multiple_choice",
          statement: `Um capital de R$ ${capital.toLocaleString("pt-BR")},00 rende 10% ao ano a juros compostos por ${years} anos (${index + 1}). Qual o montante?`,
          options: keys.map((key, slot) => ({
            key,
            text: brl(values[slot] as number),
            why: slot === 0 ? "Aplica a fórmula do trecho." : "Resultado de um erro de cálculo.",
            value: Math.round((values[slot] as number) * 100) / 100,
          })),
          answer: "A",
          explanation: `Montante = capital × (1 + taxa)^tempo, conforme o trecho ${excerpt.id}.`,
          topic: "Juros compostos",
          calculation: {
            expression: `${capital}*(1+0.1)^${years}`,
            decimals: 2,
            unit: "R$",
          },
          source,
        };
      }
      if (!choices) {
        return {
          subtype: "certo_errado",
          statement: `${subject} é um conceito do material de estudo (${index + 1}).`,
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
  // Items from a passage selected in the reader: the passage is the last quoted block.
  const passageOf = (messages: readonly { content: string }[]): string =>
    /Passage:\n"""\n([\s\S]*?)\n"""\s*$/.exec(messages.at(-1)?.content ?? "")?.[1] ?? "";
  provider.script("SelectionCards", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const passage = passageOf(messages);
    const count = Number(/Create (?:exactly|up to) (\d+) flashcards/.exec(prompt)?.[1] ?? 2);
    const subject = /Subject requested by the student: ([^\n.]*)/.exec(prompt)?.[1]?.trim();
    const subtype = /must use `subtype` = "(\w+)"/.exec(prompt)?.[1] ?? "qa";
    const words = passage.split(/\s+/).slice(0, 4).join(" ");
    return {
      cards: Array.from({ length: count }, (_, index) => ({
        subtype,
        front:
          subtype === "cloze"
            ? `{{c1::${words}}} aparece no trecho (${index + 1}).`
            : subtype === "compare"
              ? `${words} vs ${subject ?? "o resto"} (${index + 1})`
              : `O que o trecho diz sobre ${subject ?? words} (${index + 1})?`,
        back:
          subtype === "cloze"
            ? ""
            : subtype === "true_false"
              ? `Verdadeiro, conforme o trecho: ${words}.`
              : `Veja o trecho: ${words}.`,
        topic: subject ?? "Trecho selecionado",
        quote: passage.slice(0, 60),
      })),
    };
  });
  provider.script("SelectionQuestions", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const passage = passageOf(messages);
    const count = Number(/Create (?:exactly|up to) (\d+) questions/.exec(prompt)?.[1] ?? 2);
    const choices = Number(/exactly (\d) options/.exec(prompt)?.[1] ?? 0);
    const words = passage.split(/\s+/).slice(0, 4).join(" ");
    return {
      questions: Array.from({ length: count }, (_, index) =>
        choices > 0 && /must use `subtype` = "multiple_choice"/.test(prompt)
          ? {
              subtype: "multiple_choice",
              statement: `Qual alternativa descreve ${words} (${index + 1})?`,
              options: "ABCDE"
                .slice(0, choices)
                .split("")
                .map((key) => ({
                  key,
                  text: key === "A" ? "Descrição correta do trecho" : `Descrição errada ${key}`,
                  why: key === "A" ? "Confere com o trecho." : "Não confere.",
                })),
              answer: "A",
              explanation: "A alternativa A repete o trecho.",
              topic: "Trecho selecionado",
              quote: passage.slice(0, 60),
            }
          : {
              subtype: "certo_errado",
              statement: `${words} aparece no trecho selecionado (${index + 1}).`,
              options: [],
              answer: "C",
              explanation: "O trecho confirma a afirmação.",
              topic: "Trecho selecionado",
              quote: passage.slice(0, 60),
            },
      ),
    };
  });
  // Help with the text of an item: the answer repeats the item with a marker, so a run can see it.
  provider.script("AssistCard", (messages: readonly { content: string }[]) => {
    const item = /Item:\n"""\nfront: ([\s\S]*?)\nback: ([\s\S]*?)\n"""\s*$/.exec(
      messages.at(-1)?.content ?? "",
    );
    return { front: `${item?.[1] ?? ""} (revisado)`, back: item?.[2] ?? "" };
  });
  provider.script("AssistQuestion", (messages: readonly { content: string }[]) => {
    // The item is rendered one field per line: statement, options (A) text [why: ...]), answer, explanation.
    const block = /Item:\n"""\n([\s\S]*?)\n"""\s*$/.exec(messages.at(-1)?.content ?? "")?.[1] ?? "";
    const lines = block.split("\n");
    const field = (name: string): string =>
      lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? "";
    const options = lines
      .map((line) => /^([A-E])\) (.*) \[why: (.*)\]$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({
        key: match[1] as string,
        text: match[2] as string,
        why: match[3] as string,
      }));
    return {
      statement: `${field("statement")} (revisado)`,
      options,
      answer: field("answer"),
      explanation: field("explanation"),
    };
  });
  provider.script("ChatAnswer", (messages: readonly { content: string }[]) => {
    const prompt = messages.at(-1)?.content ?? "";
    const question = /Question: ([\s\S]*)$/.exec(prompt)?.[1]?.trim() ?? "";
    const first = parseExcerpts(prompt)[0];
    if (!first) return { supported: false, answer: "Sem trechos.", citations: [] };
    return {
      supported: true,
      answer: `Segundo o material: ${first.text.slice(0, 80)} (pergunta: ${question})`,
      citations: [{ chunk_id: first.id, quote: first.text.slice(0, 60) }],
    };
  });
  provider.script("RelevanceBatch", allInScope);
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
