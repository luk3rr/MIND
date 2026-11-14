/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { desc } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import type { Llm } from "../core.js";
import { chatMessage } from "../db/workspace-schema.js";
import type { RetrievedChunk, Retriever } from "../retrieval/retriever.js";
import { SourceChecker } from "../verification/source-checker.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { buildChatMessages } from "./prompts.js";
import { chatAnswerSchema } from "./schemas.js";
import type { ChatAnswer } from "./schemas.js";

export const NO_SUPPORT = "Não encontrei suporte no material para responder a essa pergunta.";
export const MAX_QUESTION_CHARS = 1000;
export const RETRIEVE_LIMIT = 8;
export const HISTORY_LIMIT = 50;

export interface CitationInfo {
  chunkId: number;
  materialId: number;
  materialTitle: string;
  page: number | null;
  section: string | null;
  quote: string;
}

export interface ChatReply {
  id: number;
  question: string;
  answer: string;
  supported: boolean;
  citations: CitationInfo[];
  costUsd: number;
  createdAt: string;
}

function chunkLabel(found: RetrievedChunk): string {
  const where = found.page ? `, p. ${found.page}` : "";
  return `${found.materialTitle}${where}`;
}

function toReply(row: typeof chatMessage.$inferSelect): ChatReply {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    supported: row.supported,
    citations: JSON.parse(row.citationsJson) as CitationInfo[],
    costUsd: row.costUsd,
    createdAt: row.createdAt,
  };
}

/** Answers questions from the workspace's material, with verified citations (FR-18). */
export class ChatService {
  private readonly checker = new SourceChecker();

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly llm: Llm,
    private readonly retriever: Retriever,
    private readonly clock: Clock = systemClock,
  ) {}

  private get db() {
    return this.workspace.connection.db;
  }

  /** Answers one independent question. The model is called only when excerpts were found. */
  async ask(question: string): Promise<ChatReply> {
    const clean = question.split(/\s+/).filter(Boolean).join(" ");
    if (!clean) {
      throw new AppError("VALIDATION_ERROR", "Escreva uma pergunta.", [
        { field: "question", message: "Informe a pergunta." },
      ]);
    }
    if (clean.length > MAX_QUESTION_CHARS) {
      throw new AppError("VALIDATION_ERROR", "A pergunta é longa demais.", [
        { field: "question", message: `Use até ${MAX_QUESTION_CHARS} caracteres.` },
      ]);
    }
    const found = await this.retriever.search(clean, { limit: RETRIEVE_LIMIT });
    if (found.length === 0) return this.store(clean, NO_SUPPORT, false, [], null, 0);

    this.llm.ensureReady();
    const model = this.llm.settings.get().generationModel;
    const prompt = found.map((c) => ({ id: c.chunkId, label: chunkLabel(c), text: c.text }));
    const { value, usage } = await this.llm.provider.complete(
      buildChatMessages(clean, prompt),
      chatAnswerSchema,
      { model, purpose: "chat", schemaName: "ChatAnswer" },
    );
    const citations = this.validCitations(value, found);
    const cost = usage.costUsd ?? 0;
    if (!value.supported || citations.length === 0 || !value.answer.trim()) {
      return this.store(clean, NO_SUPPORT, false, [], model, cost);
    }
    return this.store(clean, value.answer.trim(), true, citations, model, cost);
  }

  private validCitations(answer: ChatAnswer, found: readonly RetrievedChunk[]): CitationInfo[] {
    const byId = new Map(found.map((c) => [c.chunkId, c]));
    const kept: CitationInfo[] = [];
    const seen = new Set<string>();
    for (const citation of answer.citations) {
      const source = byId.get(citation.chunk_id);
      if (!source || !this.checker.check(citation.quote, source.text).valid) continue;
      const key = `${source.chunkId}\u0000${citation.quote}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push({
        chunkId: source.chunkId,
        materialId: source.materialId,
        materialTitle: source.materialTitle,
        page: source.page,
        section: source.section,
        quote: citation.quote,
      });
    }
    return kept;
  }

  private store(
    question: string,
    answer: string,
    supported: boolean,
    citations: CitationInfo[],
    model: string | null,
    cost: number,
  ): ChatReply {
    const row = this.db
      .insert(chatMessage)
      .values({
        question,
        answer,
        supported,
        citationsJson: JSON.stringify(citations),
        model,
        costUsd: cost,
        createdAt: this.clock.now().toISOString(),
      })
      .returning()
      .get();
    return toReply(row);
  }

  /** The latest messages, oldest first. */
  history(limit = HISTORY_LIMIT): ChatReply[] {
    return this.db
      .select()
      .from(chatMessage)
      .orderBy(desc(chatMessage.id))
      .limit(limit)
      .all()
      .reverse()
      .map(toReply);
  }

  clear(): number {
    return this.db.delete(chatMessage).returning({ id: chatMessage.id }).all().length;
  }
}
