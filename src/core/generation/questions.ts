/*
 * Filename: questions.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { dependsOnSource, withSelfContained } from "./self-contained.js";
import { and, eq, ne } from "drizzle-orm";
import { item, topic } from "../db/workspace-schema.js";
import type { WorkspaceDb } from "../jobs/store.js";
import type { Provider } from "../llm/provider.js";
import { normalize, SourceChecker } from "../verification/source-checker.js";
import { checkCalculation, formatNumber } from "./calc.js";
import { cleanTopic, emptyOutcome, note } from "./cards.js";
import type { BatchOutcome } from "./cards.js";
import { Judge } from "./judge.js";
import { chunkLabel } from "./planning.js";
import type { SourceChunk } from "./planning.js";
import type { PromptChunk, PromptExtra } from "./prompts.js";
import { buildQuestionMessages } from "./question-prompts.js";
import { PROFILES, questionBatchSchema } from "./schemas.js";
import type { OptionOut, QuestionOut, QuestionPayload } from "./schemas.js";
import { topTopics, upsertTopic, withKnownTopics } from "./topics.js";
import type { KnownTopics } from "./topics.js";

export const CERTO_ERRADO_OPTIONS: OptionOut[] = [
  { key: "C", text: "Certo", why: "" },
  { key: "E", text: "Errado", why: "" },
];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Why a generated question is malformed for its profile, or null when it is fine. */
export function questionProblem(question: QuestionOut, profile: string): string | null {
  const wanted = PROFILES[profile];
  if (!wanted) return "unknown_profile";
  if (question.subtype !== wanted.subtype) return "wrong_subtype";
  if (!question.statement.trim()) return "empty_statement";
  if (dependsOnSource(question.statement)) return "not_self_contained";
  if (!question.explanation.trim()) return "empty_explanation";
  if (wanted.subtype === "certo_errado")
    return ["C", "E"].includes(question.answer) ? null : "bad_answer";
  const options = question.options;
  if (options.length !== wanted.options) return "wrong_option_count";
  if (options.map((o) => o.key).join("") !== LETTERS.slice(0, wanted.options))
    return "bad_option_keys";
  if (options.some((o) => !o.text.trim() || !o.why.trim())) return "empty_option";
  if (new Set(options.map((o) => normalize(o.text).text)).size !== options.length)
    return "duplicate_options";
  if (!options.some((o) => o.key === question.answer)) return "bad_answer";
  if (wanted.calculation)
    return checkCalculation(question.calculation, options, question.answer).problem;
  return null;
}

/** The payload that is stored; a calculation question keeps the expression the app confirmed. */
export function payloadFor(question: QuestionOut): QuestionPayload {
  const options =
    question.subtype === "certo_errado"
      ? CERTO_ERRADO_OPTIONS
      : question.options.map((o) => ({ key: o.key, text: o.text.trim(), why: o.why.trim() }));
  const payload: QuestionPayload = {
    statement: question.statement.trim(),
    options,
    answer: question.answer,
    explanation: question.explanation.trim(),
  };
  const calculation = question.calculation;
  const computed = calculation
    ? checkCalculation(calculation, question.options, question.answer).computed
    : null;
  if (calculation && computed !== null) {
    payload.calculation = {
      expression: calculation.expression.trim(),
      decimals: calculation.decimals,
      unit: calculation.unit?.trim() || null,
      result: Number(computed.toFixed(calculation.decimals)),
    };
    payload.explanation += `\n\nConta conferida pelo app: ${calculation.expression.trim()} = ${formatNumber(computed, calculation.decimals)}${calculation.unit?.trim() ? ` ${calculation.unit.trim()}` : ""}`;
  }
  return payload;
}

interface Candidate {
  question: QuestionOut;
  chunk: SourceChunk;
}

export interface QuestionBatchRequest {
  runId: number;
  profile: string;
  count: number;
  chunks: SourceChunk[];
  model: string;
  judgeModel: string;
  remaining: () => number;
  topicId?: number | null;
  avoid?: string[];
  /** The person's own instructions and the items to vary. */
  extra?: PromptExtra;
}

/** Questions with a verified source and a second-model check that the answer is supported. */
export class QuestionGenerator {
  private readonly judge: Judge;

  constructor(
    private readonly db: WorkspaceDb,
    private readonly sqlite: { transaction<T>(fn: () => T): () => T },
    private readonly provider: Provider,
    private readonly checker = new SourceChecker(),
  ) {
    this.judge = new Judge(provider);
  }

  async generateBatch(request: QuestionBatchRequest): Promise<BatchOutcome> {
    const promptChunks: PromptChunk[] = request.chunks.map((c) => ({
      id: c.id,
      label: chunkLabel(c),
      text: c.text,
    }));
    const { value, usage } = await this.provider.complete(
      withKnownTopics(
        withSelfContained(
          buildQuestionMessages(
            request.profile,
            request.count,
            promptChunks,
            request.avoid ?? [],
            request.extra ?? {},
          ),
        ),
        request.topicId ? [] : topTopics(this.db),
      ),
      questionBatchSchema,
      { model: request.model, purpose: "generation", schemaName: "QuestionBatch" },
    );
    const outcome = emptyOutcome(usage.costUsd ?? 0);
    let candidates = this.screen(
      request.profile,
      value.questions,
      new Map(request.chunks.map((c) => [c.id, c])),
      outcome,
    );
    if (candidates.length > 0) {
      const verdict = await this.judge.judge(
        candidates.map((c) => ({
          excerpt: c.chunk.text,
          statement: c.question.statement,
          options: c.question.options.map((o) => [o.key, o.text] as [string, string]),
          answer: c.question.answer,
        })),
        request.judgeModel,
        PROFILES[request.profile]?.calculation === true,
      );
      outcome.costUsd += verdict.costUsd;
      const kept: Candidate[] = [];
      candidates.forEach((candidate, index) => {
        if (verdict.supported[index]) kept.push(candidate);
        else {
          outcome.unsupported += 1;
          note(outcome, `unsupported: ${verdict.reasons[index]}`, candidate.question.statement);
        }
      });
      candidates = kept;
    }
    // No `await` below: duplicates are re-checked and the drafts stored atomically.
    this.sqlite.transaction(() => this.store(request, candidates, outcome))();
    return outcome;
  }

  private screen(
    profile: string,
    questions: QuestionOut[],
    byId: Map<number, SourceChunk>,
    outcome: BatchOutcome,
  ): Candidate[] {
    const seen = this.existingStatements();
    const found: Candidate[] = [];
    for (const question of questions) {
      const problem = questionProblem(question, profile);
      if (problem !== null) {
        outcome.invalid += 1;
        note(outcome, problem, question.statement);
        continue;
      }
      const chunk = byId.get(question.source.chunk_id);
      if (!chunk) {
        outcome.noSource += 1;
        note(outcome, "chunk_not_in_batch", question.statement);
        continue;
      }
      const check = this.checker.check(question.source.quote, chunk.text);
      if (!check.valid) {
        outcome.noSource += 1;
        note(outcome, check.reason ?? "invalid_source", question.statement);
        continue;
      }
      const key = normalize(question.statement).text;
      if (seen.has(key)) {
        outcome.duplicate += 1;
        note(outcome, "duplicate", question.statement);
        continue;
      }
      seen.add(key);
      found.push({ question, chunk });
    }
    return found;
  }

  private store(
    request: QuestionBatchRequest,
    candidates: Candidate[],
    outcome: BatchOutcome,
  ): void {
    const seen = this.existingStatements();
    const topics: KnownTopics = new Map(
      this.db
        .select()
        .from(topic)
        .all()
        .map((row) => [row.name.toLowerCase(), row]),
    );
    const remaining = request.remaining();
    for (const candidate of candidates) {
      if (outcome.accepted >= remaining) break;
      const { question } = candidate;
      const key = normalize(question.statement).text;
      if (seen.has(key)) {
        outcome.duplicate += 1;
        note(outcome, "duplicate", question.statement);
        continue;
      }
      seen.add(key);
      const forced = request.topicId ?? null;
      const resolved =
        forced === null ? upsertTopic(this.db, topics, cleanTopic(question.topic)) : null;
      this.db
        .insert(item)
        .values({
          runId: request.runId,
          kind: "question",
          subtype: question.subtype,
          payloadJson: JSON.stringify(payloadFor(question)),
          status: "draft",
          topicId: forced ?? resolved?.id ?? null,
          chunkId: candidate.chunk.id,
          sourceTitle: candidate.chunk.materialTitle,
          sourcePage: candidate.chunk.page,
          quote: question.source.quote.trim(),
        })
        .run();
      outcome.accepted += 1;
    }
  }

  private existingStatements(): Set<string> {
    const rows = this.db
      .select({ payload: item.payloadJson })
      .from(item)
      .where(and(eq(item.kind, "question"), ne(item.status, "discarded")))
      .all();
    return new Set(
      rows.map(
        (r) =>
          normalize(String((JSON.parse(r.payload) as { statement?: string }).statement ?? "")).text,
      ),
    );
  }
}
