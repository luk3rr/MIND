/*
 * Filename: question-prompts.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Message } from "../llm/types.js";
import { renderAvoid, renderChunks } from "./prompts.js";
import type { PromptChunk } from "./prompts.js";

// The texts below are copied from the Python implementation and checked against fixtures.

export const QUESTION_SYSTEM =
  'You write exam-style practice questions from excerpts of the user\'s own study material.\n\nRules:\n- Write every question in Brazilian Portuguese (pt-BR), even when the excerpts are in another language.\n- Use ONLY information found in the excerpts. The correct answer must follow from the excerpt alone, never from outside knowledge.\n- Each question tests one idea and has exactly one correct answer; avoid ambiguity, double negatives and "all/none of the above".\n- For every question, set `source.chunk_id` to the id of the excerpt that proves the answer and `source.quote` to a passage copied VERBATIM from that excerpt, in its original language, between 15 and 300 characters long.\n- `explanation` is a short comment (one to three sentences) that justifies the answer.\n- Write mathematical formulas in LaTeX between $...$ or $$...$$.\n- Set `topic` to a short, consistent label (up to 5 words).\n- Do not repeat a question.\n';

export const PROFILE_RULES: Record<string, string> = {
  certo_errado:
    'Question type "certo_errado": `statement` is one self-contained claim that is either right or wrong according to the excerpt. Set `answer` to "C" (right) or "E" (wrong) and leave `options` empty. Make about half of the claims right and half wrong; a wrong claim must change a meaningful detail of the excerpt, not be absurd.',
  multiple_choice_4:
    'Question type "multiple_choice" with exactly 4 options: `statement` is the question; `options` has keys "A" to "D" in order, each with `text` and `why` (why it is right or wrong); `answer` is the key of the single correct option. Distractors must be plausible and clearly different from each other.',
  multiple_choice_5:
    'Question type "multiple_choice" with exactly 5 options: `statement` is the question; `options` has keys "A" to "E" in order, each with `text` and `why` (why it is right or wrong); `answer` is the key of the single correct option. Distractors must be plausible and clearly different from each other.',
};

export const JUDGE_SYSTEM =
  "You are a strict reviewer of exam questions. For each numbered question you receive the source excerpt, the question, its options (if any) and the proposed answer.\n\nA question is `supported` only if ALL of these hold:\n1. The proposed answer is established by the excerpt alone.\n2. Exactly one option (or the right/wrong verdict) is correct; no other option is also defensible.\n3. The statement is unambiguous.\nOtherwise it is not supported. When in doubt, answer `supported: false`. Return one verdict per question, using its `index`, with a short `reason`.\n";

export interface JudgeItem {
  excerpt: string;
  statement: string;
  options: [string, string][];
  answer: string;
}

export function buildQuestionMessages(
  profile: string,
  count: number,
  chunks: readonly PromptChunk[],
  avoid: readonly string[] = [],
): Message[] {
  const task =
    `Create exactly ${count} questions from the excerpts below. ${PROFILE_RULES[profile]}\n\n` +
    `Excerpts:\n\n${renderChunks(chunks)}${renderAvoid(avoid)}`;
  return [
    { role: "system", content: QUESTION_SYSTEM },
    { role: "user", content: task },
  ];
}

export function buildJudgeMessages(items: readonly JudgeItem[]): Message[] {
  const blocks = items.map((item, index) => {
    const options =
      item.options.map(([key, text]) => `  ${key}) ${text}`).join("\n") || "  (certo/errado)";
    return (
      `[question ${index}]\nExcerpt:\n${item.excerpt}\n\nStatement: ${item.statement}\n` +
      `Options:\n${options}\nProposed answer: ${item.answer}`
    );
  });
  return [
    { role: "system", content: JUDGE_SYSTEM },
    { role: "user", content: blocks.join("\n\n") },
  ];
}
