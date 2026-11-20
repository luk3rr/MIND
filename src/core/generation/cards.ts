/*
 * Filename: cards.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, eq, ne } from "drizzle-orm";
import { item, topic } from "../db/workspace-schema.js";
import type { WorkspaceDb } from "../jobs/store.js";
import type { Provider } from "../llm/provider.js";
import { normalize, SourceChecker } from "../verification/source-checker.js";
import { buildCardMessages } from "./prompts.js";
import type { PromptChunk, PromptExtra, PromptScope } from "./prompts.js";
import { chunkLabel } from "./planning.js";
import type { SourceChunk } from "./planning.js";
import { Judge } from "./judge.js";
import { cardBatchSchema } from "./schemas.js";
import { dependsOnSource, withSelfContained } from "./self-contained.js";
import type { CardOut, CardPayload } from "./schemas.js";
import { topTopics, upsertTopic, withKnownTopics } from "./topics.js";
import type { KnownTopics } from "./topics.js";

const CLOZE_GAP = /\{\{c\d+::[\s\S]+?\}\}/;
const TRUE_FALSE_BACK = /^\s*(verdadeiro|falso)\b/i;
export const MAX_TOPIC_CHARS = 80;
export const LOG_LIMIT = 20;

export interface DiscardNote {
  reason: string;
  front: string;
}

export interface BatchOutcome {
  accepted: number;
  noSource: number;
  invalid: number;
  duplicate: number;
  unsupported: number;
  /** Items the relevance judge found to be about something other than the subject. */
  outOfScope: number;
  costUsd: number;
  log: DiscardNote[];
}

export function emptyOutcome(costUsd = 0): BatchOutcome {
  return {
    accepted: 0,
    noSource: 0,
    invalid: 0,
    duplicate: 0,
    unsupported: 0,
    outOfScope: 0,
    costUsd,
    log: [],
  };
}

export function note(outcome: BatchOutcome, reason: string, text: string): void {
  if (outcome.log.length < LOG_LIMIT) outcome.log.push({ reason, front: text.slice(0, 80) });
}

export function cleanTopic(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.split(/\s+/).filter(Boolean).join(" ").slice(0, MAX_TOPIC_CHARS);
  return cleaned || null;
}

/** Why a card's text is malformed for its type, or null when it is fine. */
export function payloadProblem(subtype: string, front: string, back: string): string | null {
  if (!front.trim()) return "empty_front";
  if (subtype !== "cloze" && !back.trim()) return "empty_back";
  if (subtype === "cloze" && !CLOZE_GAP.test(front)) return "cloze_without_gap";
  if (subtype === "true_false" && !TRUE_FALSE_BACK.test(back)) return "true_false_without_verdict";
  return null;
}

export function cardProblem(card: CardOut, subtype: string): string | null {
  if (card.subtype !== subtype) return "wrong_subtype";
  const problem = payloadProblem(subtype, card.front, card.back);
  if (problem !== null) return problem;
  // A cloze front is a sentence of the material itself, so only the other types are checked.
  if (subtype !== "cloze" && dependsOnSource(card.front, true)) return "not_self_contained";
  return null;
}

export interface BatchRequest {
  runId: number;
  subtype: string;
  count: number;
  chunks: SourceChunk[];
  model: string;
  /** The model that reviews whether each card is about the subject of the material. */
  judgeModel: string;
  /** How many more cards the run still accepts. */
  remaining: () => number;
  topicId?: number | null;
  avoid?: string[];
  /** The person's own instructions and the items to vary. */
  extra?: PromptExtra;
  /** What the excerpts are about (the subject of the material). */
  scope?: PromptScope;
}

interface Candidate {
  card: CardOut;
  chunk: SourceChunk;
}

/**
 * Asks the model for cards, verifies their sources, has a second model check that they are about
 * the subject of the material, and stores the ones that pass as drafts.
 */
export class CardGenerator {
  private readonly judge: Judge;

  constructor(
    private readonly db: WorkspaceDb,
    private readonly sqlite: { transaction<T>(fn: () => T): () => T },
    private readonly provider: Provider,
    private readonly checker = new SourceChecker(),
  ) {
    this.judge = new Judge(provider);
  }

  async generateBatch(request: BatchRequest): Promise<BatchOutcome> {
    const promptChunks: PromptChunk[] = request.chunks.map((c) => ({
      id: c.id,
      label: chunkLabel(c),
      text: c.text,
      role: c.role,
      context: c.context,
    }));
    const messages = withKnownTopics(
      withSelfContained(
        buildCardMessages(
          request.subtype,
          request.count,
          promptChunks,
          request.avoid ?? [],
          request.extra ?? {},
          request.scope,
        ),
      ),
      // A topic chosen for the whole run makes the label the model writes irrelevant.
      request.topicId ? [] : topTopics(this.db),
    );
    const { value, usage } = await this.provider.complete(messages, cardBatchSchema, {
      model: request.model,
      purpose: "generation",
      schemaName: "CardBatch",
    });
    const outcome = emptyOutcome(usage.costUsd ?? 0);
    let candidates = this.screen(request, value.cards, outcome);
    if (candidates.length > 0) {
      const verdict = await this.judge.judgeRelevance(
        candidates.map((c) => ({
          excerpt: c.chunk.text,
          text: `${c.card.front.trim()}\n${c.card.back.trim()}`.trim(),
        })),
        request.judgeModel,
        request.scope?.subject ?? null,
      );
      outcome.costUsd += verdict.costUsd;
      const kept: Candidate[] = [];
      candidates.forEach((candidate, index) => {
        if (verdict.inScope[index]) kept.push(candidate);
        else {
          outcome.outOfScope += 1;
          note(outcome, `out_of_scope: ${verdict.reasons[index]}`, candidate.card.front);
        }
      });
      candidates = kept;
    }
    // No `await` below: duplicates are re-checked and the drafts stored atomically.
    this.sqlite.transaction(() => this.store(request, candidates, outcome))();
    return outcome;
  }

  /** The cards that are well formed, have a verified source and are not duplicates. */
  private screen(request: BatchRequest, cards: CardOut[], outcome: BatchOutcome): Candidate[] {
    const byId = new Map(request.chunks.map((c) => [c.id, c]));
    const seen = this.existingFronts(request.subtype);
    const found: Candidate[] = [];
    for (const card of cards) {
      const problem = cardProblem(card, request.subtype);
      if (problem !== null) {
        outcome.invalid += 1;
        note(outcome, problem, card.front);
        continue;
      }
      const source = byId.get(card.source.chunk_id);
      if (!source || source.context === true) {
        // A part sent only as context can never be what a card cites (FR-11).
        outcome.noSource += 1;
        note(outcome, source ? "source_is_context" : "chunk_not_in_batch", card.front);
        continue;
      }
      const check = this.checker.check(card.source.quote, source.text);
      if (!check.valid) {
        outcome.noSource += 1;
        note(outcome, check.reason ?? "invalid_source", card.front);
        continue;
      }
      const key = normalize(card.front).text;
      if (seen.has(key)) {
        outcome.duplicate += 1;
        note(outcome, "duplicate", card.front);
        continue;
      }
      seen.add(key);
      found.push({ card, chunk: source });
    }
    return found;
  }

  private store(request: BatchRequest, candidates: Candidate[], outcome: BatchOutcome): void {
    const seen = this.existingFronts(request.subtype);
    const topics: KnownTopics = new Map(
      this.db
        .select()
        .from(topic)
        .all()
        .map((row) => [row.name.toLowerCase(), row]),
    );
    const remaining = request.remaining();
    for (const { card, chunk: source } of candidates) {
      if (outcome.accepted >= remaining) break;
      const key = normalize(card.front).text;
      if (seen.has(key)) {
        outcome.duplicate += 1;
        note(outcome, "duplicate", card.front);
        continue;
      }
      seen.add(key);
      const forced = request.topicId ?? null;
      const resolved =
        forced === null ? upsertTopic(this.db, topics, cleanTopic(card.topic)) : null;
      const payload: CardPayload = { front: card.front.trim(), back: card.back.trim() };
      this.db
        .insert(item)
        .values({
          runId: request.runId,
          kind: "card",
          subtype: request.subtype,
          payloadJson: JSON.stringify(payload),
          status: "draft",
          topicId: forced ?? resolved?.id ?? null,
          chunkId: source.id,
          sourceTitle: source.materialTitle,
          sourcePage: source.page,
          quote: card.source.quote.trim(),
        })
        .run();
      outcome.accepted += 1;
    }
  }

  private existingFronts(subtype: string): Set<string> {
    const rows = this.db
      .select({ payload: item.payloadJson })
      .from(item)
      .where(and(eq(item.kind, "card"), eq(item.subtype, subtype), ne(item.status, "discarded")))
      .all();
    return new Set(
      rows.map(
        (row) =>
          normalize(String((JSON.parse(row.payload) as { front?: string }).front ?? "")).text,
      ),
    );
  }
}
