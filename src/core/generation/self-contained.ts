/*
 * Filename: self-contained.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Message } from "../llm/types.js";

/**
 * What the model is told on top of the base rules: the person sees only the item, never the
 * excerpt it came from, so the item has to make sense on its own.
 */
export const SELF_CONTAINED_RULES =
  "- Every item must be fully self-contained: the person sees ONLY the item, never the excerpt. " +
  'Never refer to "the text", "the excerpt", "the passage", "the comment", "the statement", ' +
  '"the question", "the figure", "the table" or to an alternative letter without reproducing ' +
  "what is referred to. If the excerpt holds an exam question, do not reproduce it as an item: " +
  "use it only as inspiration for a new, self-contained item that tests the same skill with new " +
  "data, or skip it.\n";

/** What the reviewer is told on top of its own criteria. */
export const SELF_CONTAINED_JUDGE =
  "\nAlso treat a question as not supported when its statement cannot be understood without " +
  'seeing the excerpt: it refers to "the text", "the passage", a comment or a figure that it ' +
  "does not reproduce.\n";

/** Adds the self-contained criterion to the system message of a review prompt. */
export function withSelfContainedJudge(messages: readonly Message[]): Message[] {
  return messages.map((message) =>
    message.role === "system"
      ? { ...message, content: `${message.content}${SELF_CONTAINED_JUDGE}` }
      : message,
  );
}

/** Adds the self-contained rules to the system message of a prompt. */
export function withSelfContained(messages: readonly Message[]): Message[] {
  return messages.map((message) =>
    message.role === "system"
      ? { ...message, content: `${message.content}${SELF_CONTAINED_RULES}` }
      : message,
  );
}

const SOURCE_NOUN =
  "texto|trecho|excerto|passagem|comentario|enunciado|questao|figura|grafico|tabela|quadro|imagem|apostila|material";
const LETTER_REFERENCE = /\b(alternativa|letra|opcao|item|afirmativa)\s+[a-e]\b/;

const PATTERNS: RegExp[] = [
  // "segundo o comentário", "de acordo com o texto", "com base na figura"
  new RegExp(
    `\\b(segundo|de acordo com|conforme|com base|baseando-se|baseado|a partir)\\s+(d?[oa]s?|n[oa]s?)?\\s*(${SOURCE_NOUN})\\b`,
  ),
  // "o texto acima", "a figura apresentada", "o trecho a seguir"
  new RegExp(
    `\\b(${SOURCE_NOUN})\\s+(acima|abaixo|anterior|a seguir|apresentad[oa]s?|citad[oa]s?|fornecid[oa]s?|mencionad[oa]s?|dad[oa]s?)\\b`,
  ),
  // "nesta questão", "da questão", "a questão"
  /\b(n?[ao]|d[ao]|nest[ae]|dest[ae]|ness[ae]|dess[ae])\s+questao\b/,
  // "no comentário", "do enunciado", "na figura"
  /\b(n?[oa]|d[oa])\s+(comentario|enunciado|figura|grafico|tabela|quadro|imagem)\b/,
];

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether a card front or a question statement leans on the source material it was made from
 * ("segundo o comentário da questão", "o texto acima"). A letter of an alternative counts only
 * for cards (`letters`), which have no alternatives of their own.
 */
export function dependsOnSource(text: string, letters = false): boolean {
  const flat = plain(text);
  if (PATTERNS.some((pattern) => pattern.test(flat))) return true;
  return letters && LETTER_REFERENCE.test(flat);
}
