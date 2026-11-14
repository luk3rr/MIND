/*
 * Filename: schemas.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";

export const CARD_SUBTYPES = ["qa", "cloze", "compare", "true_false"] as const;
export type CardSubtype = (typeof CARD_SUBTYPES)[number];

export const sourceRefSchema = z.object({
  chunk_id: z.number().int().describe("Id of the excerpt that supports the card."),
  quote: z.string().describe("Text copied verbatim from that excerpt."),
});

export const cardOutSchema = z.object({
  subtype: z.enum(CARD_SUBTYPES),
  front: z.string(),
  back: z.string(),
  topic: z.string().nullable().optional().describe("Short topic label, up to 5 words."),
  source: sourceRefSchema,
});
export type CardOut = z.infer<typeof cardOutSchema>;

export const cardBatchSchema = z.object({ cards: z.array(cardOutSchema) });

/** What is stored in `item.payload_json` for a card (the source lives on the item). */
export interface CardPayload {
  front: string;
  back: string;
}

export type QuestionSubtype = "certo_errado" | "multiple_choice";

export interface Profile {
  subtype: QuestionSubtype;
  options: number;
}

export const PROFILES: Record<string, Profile> = {
  certo_errado: { subtype: "certo_errado", options: 2 },
  multiple_choice_4: { subtype: "multiple_choice", options: 4 },
  multiple_choice_5: { subtype: "multiple_choice", options: 5 },
};

export const optionOutSchema = z.object({
  key: z.string().describe('"A", "B", ... in order (multiple choice only).'),
  text: z.string(),
  why: z.string().describe("Why this option is right or wrong."),
});
export type OptionOut = z.infer<typeof optionOutSchema>;

export const questionOutSchema = z.object({
  subtype: z.enum(["certo_errado", "multiple_choice"]),
  statement: z.string(),
  options: z.array(optionOutSchema).default([]).describe("Leave empty for certo_errado."),
  answer: z.string().describe('"C" or "E" for certo_errado, an option key otherwise.'),
  explanation: z.string().describe("Short comment that justifies the answer."),
  topic: z.string().nullable().optional().describe("Short topic label, up to 5 words."),
  source: sourceRefSchema,
});
export type QuestionOut = z.infer<typeof questionOutSchema>;

export const questionBatchSchema = z.object({ questions: z.array(questionOutSchema) });

export const verdictSchema = z.object({
  index: z.number().int().describe("Position of the question in the list, starting at 0."),
  supported: z.boolean(),
  reason: z.string().default(""),
});

export const judgeBatchSchema = z.object({ verdicts: z.array(verdictSchema) });

/** What is stored in `item.payload_json` for a question. */
export interface QuestionPayload {
  statement: string;
  options: OptionOut[];
  answer: string;
  explanation: string;
}
