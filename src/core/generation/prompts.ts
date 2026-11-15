/*
 * Filename: prompts.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Message } from "../llm/types.js";

export const MIN_QUOTE = 15;
export const MAX_QUOTE = 300;

export const SYSTEM = `You write study flashcards from excerpts of the user's own study material.

Rules:
- Write every card in Brazilian Portuguese (pt-BR), even when the excerpts are in another language. Keep technical terms that are normally left untranslated.
- Use ONLY information found in the excerpts. Never add outside knowledge.
- Each card must be atomic: one concept per card, short and unambiguous.
- For every card, set \`source.chunk_id\` to the id of the excerpt that supports it and \`source.quote\` to a passage copied VERBATIM from that excerpt, in its original language, between ${MIN_QUOTE} and ${MAX_QUOTE} characters long. Do not paraphrase, translate or correct the quote.
- Write mathematical formulas in LaTeX between $...$ (inline) or $$...$$ (display).
- Set \`topic\` to a short, consistent label (up to 5 words) so related cards share it.
- Do not repeat a card. Prefer facts, definitions, rules and relations that are worth memorizing; skip trivia, headings and formatting remarks.
`;

export const SUBTYPE_RULES: Record<string, string> = {
  qa: 'Card type "qa": `front` is a clear question; `back` is the short, complete answer.',
  cloze:
    'Card type "cloze": `front` is a sentence from the material with the key term hidden ' +
    "as {{c1::term}} (use {{c2::...}} for a second gap if needed); `back` is an optional " +
    "short extra comment and may be an empty string.",
  compare:
    'Card type "compare": `front` names two or more similar concepts as "X vs Y"; `back` ' +
    "is a short Markdown table or list of the differences that matter.",
  true_false:
    'Card type "true_false": `front` is one statement; `back` starts with "Verdadeiro" or ' +
    '"Falso" followed by a one-sentence explanation. Mix true and false statements.',
};

export interface PromptChunk {
  id: number;
  label: string;
  text: string;
}

export function renderChunks(chunks: readonly PromptChunk[]): string {
  return chunks.map((c) => `[excerpt ${c.id} | ${c.label}]\n${c.text}`).join("\n\n");
}

/** What the person asked on top of the type and quantity, and the items to vary (if any). */
export interface PromptExtra {
  /** Free text from the person, such as "focus on application questions". */
  instructions?: string | undefined;
  /** Existing items (their question or front side) to write new variations of. */
  seeds?: readonly string[] | undefined;
}

export const MAX_INSTRUCTIONS = 500;

/**
 * The part of the prompt that carries the person's own request. It never loosens the rules of
 * the system prompt: the source and the verbatim quote are still required.
 */
export function renderExtra(extra: PromptExtra = {}): string {
  const parts: string[] = [];
  const seeds = extra.seeds ?? [];
  if (seeds.length > 0) {
    parts.push(
      "Write new VARIATIONS of the existing items below: test the same idea in a different way " +
        "(other wording, other data, another angle) without copying them. Each new item still " +
        "needs its own source and verbatim quote from the excerpts above.\n" +
        seeds.map((text) => `- ${text}`).join("\n"),
    );
  }
  const instructions = extra.instructions?.trim();
  if (instructions) {
    parts.push(
      "Extra instructions from the user (follow them when they do not conflict with the rules " +
        "above; they never change the source and quote rules):\n" +
        instructions,
    );
  }
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}

export function renderAvoid(avoid: readonly string[]): string {
  if (avoid.length === 0) return "";
  const listing = avoid.map((text) => `- ${text}`).join("\n");
  return `\n\nItems that already exist on this topic (do not repeat them):\n${listing}`;
}

export function buildCardMessages(
  subtype: string,
  count: number,
  chunks: readonly PromptChunk[],
  avoid: readonly string[] = [],
  extra: PromptExtra = {},
): Message[] {
  const task =
    `Create exactly ${count} flashcards of one type from the excerpts below. ` +
    `${SUBTYPE_RULES[subtype]} Every card must use \`subtype\` = "${subtype}".\n\n` +
    `Excerpts:\n\n${renderChunks(chunks)}${renderAvoid(avoid)}${renderExtra(extra)}`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: task },
  ];
}
