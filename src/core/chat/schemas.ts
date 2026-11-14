/*
 * Filename: schemas.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";

export const chatCitationSchema = z.object({
  chunk_id: z.number().int().describe("Id of the excerpt that supports the answer."),
  quote: z.string().describe("Text copied verbatim from that excerpt."),
});

export const chatAnswerSchema = z.object({
  supported: z.boolean().describe("False when the excerpts do not answer the question."),
  answer: z.string().describe("The answer in Brazilian Portuguese, using only the excerpts."),
  citations: z.array(chatCitationSchema).default([]),
});
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;
