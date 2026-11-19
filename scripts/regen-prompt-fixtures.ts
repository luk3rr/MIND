/*
 * Filename: regen-prompt-fixtures.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/**
 * Rewrites the generation entries of `fixtures/prompts.json` (card prompts, question prompts and
 * judge prompts) from the prompt builders in `src/core/generation`.
 *
 * The file was extracted from the Python implementation and is otherwise frozen (see
 * `fixtures/README.md`). The generation prompts now differ from the Python ones on purpose, so
 * when they change by decision this script keeps the golden values in step. The chat entries and
 * the inputs (chunks, avoid list, counts, judge items) are never touched.
 *
 * Run it with `pnpm fixtures:prompts` and review the diff.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCardMessages } from "../src/core/generation/prompts.js";
import type { PromptChunk } from "../src/core/generation/prompts.js";
import {
  buildJudgeMessages,
  buildQuestionMessages,
} from "../src/core/generation/question-prompts.js";
import type { JudgeItem } from "../src/core/generation/question-prompts.js";

interface Message {
  role: string;
  content: string;
}

interface Golden {
  chunks: PromptChunk[];
  avoid: string[];
  count: number;
  question_count: number;
  judge_items: JudgeItem[];
  card_messages: Record<string, Message[]>;
  question_messages: Record<string, Message[]>;
  judge_messages: Message[];
  [key: string]: unknown;
}

const PATH = join(import.meta.dirname, "..", "fixtures", "prompts.json");

/** The golden file with the generation entries rebuilt; every other key is kept as it is. */
export function regenerate(golden: Golden): Golden {
  const card_messages: Record<string, Message[]> = {};
  for (const subtype of Object.keys(golden.card_messages)) {
    card_messages[subtype] = buildCardMessages(subtype, golden.count, golden.chunks, golden.avoid);
  }
  const question_messages: Record<string, Message[]> = {};
  for (const profile of Object.keys(golden.question_messages)) {
    question_messages[profile] = buildQuestionMessages(
      profile,
      golden.question_count,
      golden.chunks,
      golden.avoid,
    );
  }
  return {
    ...golden,
    card_messages,
    question_messages,
    judge_messages: buildJudgeMessages(golden.judge_items),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const golden = JSON.parse(readFileSync(PATH, "utf8")) as Golden;
  writeFileSync(PATH, `${JSON.stringify(regenerate(golden), null, 2)}\n`);
  console.log(`rewrote the generation entries of ${PATH}`);
}
