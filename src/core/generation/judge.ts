/*
 * Filename: judge.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Provider } from "../llm/provider.js";
import { buildJudgeMessages } from "./question-prompts.js";
import { withSelfContainedJudge } from "./self-contained.js";
import type { JudgeItem } from "./question-prompts.js";
import { judgeBatchSchema } from "./schemas.js";

export interface JudgeResult {
  supported: boolean[];
  reasons: string[];
  costUsd: number;
}

/** A second model reads each question with its source and says whether the answer is supported. */
export class Judge {
  constructor(private readonly provider: Provider) {}

  /** One verdict per item. A missing, repeated or out-of-range verdict counts against it. */
  async judge(
    items: readonly JudgeItem[],
    model: string,
    calculation = false,
  ): Promise<JudgeResult> {
    if (items.length === 0) return { supported: [], reasons: [], costUsd: 0 };
    const { value, usage } = await this.provider.complete(
      withSelfContainedJudge(buildJudgeMessages(items, calculation)),
      judgeBatchSchema,
      {
        model,
        purpose: "judge",
        schemaName: "JudgeBatch",
      },
    );
    const supported = items.map(() => false);
    const reasons = items.map(() => "no_verdict");
    const seen = new Set<number>();
    for (const verdict of value.verdicts) {
      if (verdict.index < 0 || verdict.index >= items.length || seen.has(verdict.index)) continue;
      seen.add(verdict.index);
      supported[verdict.index] = verdict.supported;
      reasons[verdict.index] = verdict.reason || (verdict.supported ? "supported" : "unsupported");
    }
    return { supported, reasons, costUsd: usage.costUsd ?? 0 };
  }
}
