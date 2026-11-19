/*
 * Filename: question-prompts.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Message } from "../llm/types.js";
import { renderAvoid, renderChunks, renderExtra, renderSubject } from "./prompts.js";
import type { PromptChunk, PromptExtra, PromptScope } from "./prompts.js";

/**
 * What keeps the questions on the subject of the material. Added to both question prompts; the
 * rest of the texts below come from the Python implementation (see `fixtures/README.md`).
 */
export const SCOPE_QUESTION_RULES =
  "- Each question makes the student APPLY a rule, concept or procedure of the subject (named in the task) to a case. Do not test incidental content, such as the topic of a motivating text or the names and facts inside an example, unless that content is the subject itself.\n" +
  "- When an excerpt holds an exam question, do not copy it: write a new question that tests the same skill with new data. Motivating texts are context, never the thing being tested.\n" +
  "- Return fewer questions than requested, or none, when the excerpts do not hold enough suitable content.\n";

// The texts below were copied from the Python implementation; the question and card prompts now
// differ from it on purpose (scope rules, "up to N"), and the fixtures were regenerated.

export const QUESTION_SYSTEM =
  'You write exam-style practice questions from excerpts of the user\'s own study material.\n\nRules:\n- Write every question in Brazilian Portuguese (pt-BR), even when the excerpts are in another language.\n- Use ONLY information found in the excerpts. The correct answer must follow from the excerpt alone, never from outside knowledge.\n- Each question tests one idea and has exactly one correct answer; avoid ambiguity, double negatives and "all/none of the above".\n- For every question, set `source.chunk_id` to the id of the excerpt that proves the answer and `source.quote` to a passage copied VERBATIM from that excerpt, in its original language, between 15 and 300 characters long.\n- `explanation` is a short comment (one to three sentences) that justifies the answer.\n- Write mathematical formulas in LaTeX between $...$ or $$...$$.\n- Set `topic` to a short, consistent label (up to 5 words).\n- Do not repeat a question.\n' +
  SCOPE_QUESTION_RULES;

export const PROFILE_RULES: Record<string, string> = {
  certo_errado:
    'Question type "certo_errado": `statement` is one self-contained claim that is either right or wrong according to the excerpt. Set `answer` to "C" (right) or "E" (wrong) and leave `options` empty. Make about half of the claims right and half wrong; a wrong claim must change a meaningful detail of the excerpt, not be absurd.',
  multiple_choice_4:
    'Question type "multiple_choice" with exactly 4 options: `statement` is the question; `options` has keys "A" to "D" in order, each with `text` and `why` (why it is right or wrong); `answer` is the key of the single correct option. Distractors must be plausible and clearly different from each other.',
  multiple_choice_5:
    'Question type "multiple_choice" with exactly 5 options: `statement` is the question; `options` has keys "A" to "E" in order, each with `text` and `why` (why it is right or wrong); `answer` is the key of the single correct option. Distractors must be plausible and clearly different from each other.',
  calculation_4:
    'Question type "calculation" with exactly 4 options: `subtype` is "multiple_choice"; `statement` is a numeric problem; `options` has keys "A" to "D" in order, each with `text`, `why` and `value`; `answer` is the key of the option whose value equals the result of `calculation.expression`. Fill `calculation` for every question.',
  calculation_5:
    'Question type "calculation" with exactly 5 options: `subtype` is "multiple_choice"; `statement` is a numeric problem; `options` has keys "A" to "E" in order, each with `text`, `why` and `value`; `answer` is the key of the option whose value equals the result of `calculation.expression`. Fill `calculation` for every question.',
};

/** The rules for calculation questions: the method comes from the excerpts, the numbers are new. */
export const CALCULATION_SYSTEM =
  'You write exam-style calculation questions from excerpts of the user\'s own study material.\n\nRules:\n- Write every question in Brazilian Portuguese (pt-BR), even when the excerpts are in another language.\n- The formula, rule or method needed must come from the excerpts. You choose the numbers of the problem; do not use outside formulas.\n- The statement gives every datum needed, with units, and asks for one value. One question tests one calculation.\n- For every question, set `source.chunk_id` to the id of the excerpt that contains the formula or method and `source.quote` to a passage copied VERBATIM from that excerpt, in its original language, between 15 and 300 characters long.\n- `calculation.expression` is the arithmetic that gives the answer, written with the numbers of the statement only, using + - * / ^, parentheses, sqrt(), ln(), log10(), exp(), abs(), pi and e; use a dot as the decimal separator and write rates as decimals (5% is 0.05). `calculation.decimals` is how many decimal places the answer has; `calculation.unit` is its unit when there is one.\n- Each option states a number: `value` is that number and `text` shows it in Brazilian format with exactly `calculation.decimals` decimals and the unit (for example "R$ 11.576,25"). The option text must show only its own number.\n- Distractors are the results of plausible mistakes (wrong formula, forgotten step, wrong rate) and must differ from the correct value.\n- `explanation` solves the problem step by step in a few lines and names the formula used.\n- Write mathematical formulas in LaTeX between $...$ or $$...$$.\n- Set `topic` to a short, consistent label (up to 5 words).\n- Do not repeat a question.\n' +
  SCOPE_QUESTION_RULES;

export const CALCULATION_JUDGE_SYSTEM =
  "You are a strict reviewer of exam calculation questions. For each numbered question you receive the source excerpt, the question, its options and the proposed answer. The arithmetic is verified separately by the app: do not redo it.\n\nA question is `supported` only if ALL of these hold:\n1. The formula or method the problem needs is given in the excerpt.\n2. The statement contains every datum needed and is unambiguous about what is asked.\n3. The wrong options are plausible results of mistakes and none of them is also a defensible answer.\nOtherwise it is not supported. When in doubt, answer `supported: false`. Return one verdict per question, using its `index`, with a short `reason`.\n";

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
  extra: PromptExtra = {},
  scope?: PromptScope,
): Message[] {
  const task =
    `Create up to ${count} questions from the excerpts below. ${PROFILE_RULES[profile]}\n\n` +
    `${renderSubject(scope)}Excerpts:\n\n${renderChunks(chunks)}${renderAvoid(avoid)}${renderExtra(extra)}`;
  const system = profile.startsWith("calculation_") ? CALCULATION_SYSTEM : QUESTION_SYSTEM;
  return [
    { role: "system", content: system },
    { role: "user", content: task },
  ];
}

export function buildJudgeMessages(items: readonly JudgeItem[], calculation = false): Message[] {
  const blocks = items.map((item, index) => {
    const options =
      item.options.map(([key, text]) => `  ${key}) ${text}`).join("\n") || "  (certo/errado)";
    return (
      `[question ${index}]\nExcerpt:\n${item.excerpt}\n\nStatement: ${item.statement}\n` +
      `Options:\n${options}\nProposed answer: ${item.answer}`
    );
  });
  return [
    { role: "system", content: calculation ? CALCULATION_JUDGE_SYSTEM : JUDGE_SYSTEM },
    { role: "user", content: blocks.join("\n\n") },
  ];
}
