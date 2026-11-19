/*
 * Filename: judge.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Provider } from "../llm/provider.js";
import { buildJudgeMessages, buildRelevanceMessages } from "./question-prompts.js";
import { withSelfContainedJudge } from "./self-contained.js";
import type { JudgeItem, RelevanceItem } from "./question-prompts.js";
import { judgeBatchSchema, relevanceBatchSchema } from "./schemas.js";

export interface JudgeResult {
  supported: boolean[];
  reasons: string[];
  costUsd: number;
}

export interface RelevanceResult {
  inScope: boolean[];
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
    subject: string | null = null,
  ): Promise<JudgeResult> {
    if (items.length === 0) return { supported: [], reasons: [], costUsd: 0 };
    const { value, usage } = await this.provider.complete(
      withSelfContainedJudge(buildJudgeMessages(items, calculation, subject)),
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

  /**
   * One verdict per card on whether it teaches the subject of the material. A missing, repeated
   * or out-of-range verdict counts against the card, and so does any doubt (the reviewer is told
   * to answer `in_scope: false` when unsure).
   */
  async judgeRelevance(
    items: readonly RelevanceItem[],
    model: string,
    subject: string | null,
  ): Promise<RelevanceResult> {
    if (items.length === 0) return { inScope: [], reasons: [], costUsd: 0 };
    const { value, usage } = await this.provider.complete(
      buildRelevanceMessages(items, subject),
      relevanceBatchSchema,
      { model, purpose: "judge", schemaName: "RelevanceBatch" },
    );
    const inScope = items.map(() => false);
    const reasons = items.map(() => "no_verdict");
    const seen = new Set<number>();
    for (const verdict of value.verdicts) {
      if (verdict.index < 0 || verdict.index >= items.length || seen.has(verdict.index)) continue;
      seen.add(verdict.index);
      inScope[verdict.index] = verdict.in_scope;
      reasons[verdict.index] = verdict.reason || (verdict.in_scope ? "in_scope" : "out_of_scope");
    }
    return { inScope, reasons, costUsd: usage.costUsd ?? 0 };
  }
}
