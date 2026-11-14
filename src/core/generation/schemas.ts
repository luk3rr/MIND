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
