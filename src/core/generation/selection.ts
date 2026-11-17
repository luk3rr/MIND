/*
 * Filename: selection.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { draftProblem } from "../authoring/validate.js";
import type { ItemDraft } from "../authoring/validate.js";
import { AppError } from "../contracts/errors.js";
import type { Llm } from "../core.js";
import { item, material } from "../db/workspace-schema.js";
import { logger } from "../logging.js";
import { SourceChecker, normalize } from "../verification/source-checker.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { cleanTopic } from "./cards.js";
import { dependsOnSource } from "./self-contained.js";
import { MAX_QUOTE } from "./prompts.js";
import {
  buildSelectionMessages,
  MAX_SELECTION_CHARS,
  MAX_SELECTION_INSTRUCTIONS,
  MAX_SELECTION_ITEMS,
  MAX_SUBJECT_CHARS,
  SELECTION_CARD_TYPES,
  SELECTION_QUESTION_TYPES,
  SELECTION_CARD_SYSTEM,
  SELECTION_QUESTION_SYSTEM,
} from "./selection-prompts.js";
import type { SelectionSubtype } from "./selection-prompts.js";
import { CARD_SUBTYPES, optionOutSchema } from "./schemas.js";
import {
  OUTPUT_TOKENS_PER_CARD,
  OUTPUT_TOKENS_PER_QUESTION,
  PROMPT_OVERHEAD_CHARS,
} from "./service.js";

const log = logger("selection");

const selectionCards = z.object({
  cards: z.array(
    z.object({
      subtype: z.enum(CARD_SUBTYPES),
      front: z.string(),
      back: z.string(),
      topic: z.string().nullable().optional(),
      quote: z.string(),
    }),
  ),
});

const selectionQuestions = z.object({
  questions: z.array(
    z.object({
      subtype: z.enum(["certo_errado", "multiple_choice"]),
      statement: z.string(),
      options: z.array(optionOutSchema.pick({ key: true, text: true, why: true })).default([]),
      answer: z.string(),
      explanation: z.string(),
      topic: z.string().nullable().optional(),
      quote: z.string(),
    }),
  ),
});

export interface SelectionRequest {
  materialId: number;
  /** The page of the passage; kept for the caller, the model only sees the text. */
  page: number | null;
  text: string;
  kind: "card" | "question";
  quantity?: number | undefined;
  subject?: string | undefined;
  /** One type for every item; the model chooses per item when absent. */
  subtype?: SelectionSubtype | undefined;
  /** What the person wants in their own words. */
  instructions?: string | undefined;
}

export interface SelectionDraft {
  draft: ItemDraft;
  topic: string | null;
  /** The part of the passage that supports the item. */
  quote: string;
}

export interface SelectionResult {
  drafts: SelectionDraft[];
  discarded: { noSource: number; invalid: number; duplicate: number };
  costUsd: number | null;
}

export interface SelectionEstimate {
  estimatedUsd: number | null;
  chars: number;
}

/**
 * Writes drafts from a passage the person selected in the reader. It checks each item the way
 * the generation pipeline does (valid, self-contained, quote inside the passage, not repeated),
 * but stores nothing: the person edits and saves the drafts they want.
 */
export class SelectionGenerator {
  private readonly checker = new SourceChecker();

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly llm: Llm,
  ) {}

  private get db() {
    return this.workspace.connection.db;
  }

  estimate(request: SelectionRequest): SelectionEstimate {
    this.check(request);
    const system =
      request.kind === "card" ? SELECTION_CARD_SYSTEM.length : SELECTION_QUESTION_SYSTEM.length;
    const chars =
      system +
      PROMPT_OVERHEAD_CHARS +
      request.text.trim().length +
      (request.subject?.length ?? 0) +
      (request.instructions?.length ?? 0);
    const items = request.quantity ?? MAX_SELECTION_ITEMS / 2;
    const perItem = request.kind === "card" ? OUTPUT_TOKENS_PER_CARD : OUTPUT_TOKENS_PER_QUESTION;
    return {
      estimatedUsd: this.llm.catalog.estimate(
        this.llm.settings.get().generationModel,
        chars,
        items * perItem,
      ),
      chars,
    };
  }

  async generate(request: SelectionRequest): Promise<SelectionResult> {
    this.check(request);
    this.llm.ensureReady();
    const model = this.llm.settings.get().generationModel;
    log.info("selection requested", {
      kind: request.kind,
      chars: request.text.length,
      quantity: request.quantity ?? null,
      subject: Boolean(request.subject?.trim()),
      model,
    });
    const messages = buildSelectionMessages(request);
    const passage = request.text.trim();
    const seen = this.existingTexts(request.kind);
    const result: SelectionResult = {
      drafts: [],
      discarded: { noSource: 0, invalid: 0, duplicate: 0 },
      costUsd: null,
    };
    const limit = request.quantity ?? MAX_SELECTION_ITEMS;
    const accept = (draft: ItemDraft, topic: string | null | undefined, quote: string): void => {
      const text = draft.kind === "card" ? draft.front : draft.statement;
      if (
        draftProblem(draft) !== null ||
        !this.matchesType(draft, request.subtype) ||
        dependsOnSource(text, draft.kind === "card" && draft.subtype !== "cloze")
      ) {
        result.discarded.invalid += 1;
        return;
      }
      const cited = quote.trim();
      if (!this.checker.check(cited, passage).valid || cited.length > MAX_QUOTE) {
        result.discarded.noSource += 1;
        return;
      }
      const key = normalize(text).text;
      if (seen.has(key)) {
        result.discarded.duplicate += 1;
        return;
      }
      seen.add(key);
      if (result.drafts.length >= limit) return;
      result.drafts.push({
        draft,
        topic: cleanTopic(topic) ?? cleanTopic(request.subject),
        quote: cited,
      });
    };
    if (request.kind === "card") {
      const { value, usage } = await this.llm.provider.complete(messages, selectionCards, {
        model,
        purpose: "selection",
        schemaName: "SelectionCards",
      });
      result.costUsd = usage.costUsd;
      for (const card of value.cards) {
        accept(
          { kind: "card", subtype: card.subtype, front: card.front.trim(), back: card.back.trim() },
          card.topic,
          card.quote,
        );
      }
    } else {
      const { value, usage } = await this.llm.provider.complete(messages, selectionQuestions, {
        model,
        purpose: "selection",
        schemaName: "SelectionQuestions",
      });
      result.costUsd = usage.costUsd;
      for (const question of value.questions) {
        accept(
          {
            kind: "question",
            subtype: question.subtype,
            statement: question.statement.trim(),
            options: question.subtype === "certo_errado" ? [] : question.options,
            answer: question.answer,
            explanation: question.explanation.trim(),
          },
          question.topic,
          question.quote,
        );
      }
    }
    log.info("selection answered", { drafts: result.drafts.length, ...result.discarded });
    return result;
  }

  private check(request: SelectionRequest): void {
    const fail = (field: string, message: string): never => {
      throw new AppError("VALIDATION_ERROR", message, [{ field, message }]);
    };
    const found = this.db
      .select({ id: material.id })
      .from(material)
      .where(eq(material.id, request.materialId))
      .get();
    if (!found) {
      throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${request.materialId}.`);
    }
    const text = request.text.trim();
    if (text.length > MAX_SELECTION_CHARS) {
      fail(
        "text",
        `Trecho com mais de ${MAX_SELECTION_CHARS} caracteres: selecione um trecho menor.`,
      );
    }
    if (text.length < 15) fail("text", "Selecione um trecho maior.");
    if (
      request.quantity !== undefined &&
      (request.quantity < 1 || request.quantity > MAX_SELECTION_ITEMS)
    ) {
      fail("quantity", `Peça de 1 a ${MAX_SELECTION_ITEMS} itens.`);
    }
    if ((request.instructions?.length ?? 0) > MAX_SELECTION_INSTRUCTIONS) {
      fail("instructions", `Use até ${MAX_SELECTION_INSTRUCTIONS} caracteres.`);
    }
    const allowed: readonly string[] =
      request.kind === "card" ? SELECTION_CARD_TYPES : SELECTION_QUESTION_TYPES;
    if (request.subtype !== undefined && !allowed.includes(request.subtype)) {
      fail("subtype", "Esse tipo não serve para o que foi pedido.");
    }
    if ((request.subject?.length ?? 0) > MAX_SUBJECT_CHARS) {
      fail("subject", `Use até ${MAX_SUBJECT_CHARS} caracteres.`);
    }
  }

  /** True when no type was asked for, or the draft is of the type that was. */
  private matchesType(draft: ItemDraft, wanted: SelectionSubtype | undefined): boolean {
    if (wanted === undefined) return true;
    if (draft.kind === "card") return draft.subtype === wanted;
    if (wanted === "certo_errado") return draft.subtype === "certo_errado";
    return (
      draft.subtype === "multiple_choice" &&
      draft.options.length === (wanted === "multiple_choice_5" ? 5 : 4)
    );
  }

  /** The normalised first side of every item that is still in use, to avoid repeating them. */
  private existingTexts(kind: "card" | "question"): Set<string> {
    const rows = this.db
      .select({ payload: item.payloadJson })
      .from(item)
      .where(and(eq(item.kind, kind), ne(item.status, "discarded")))
      .all();
    return new Set(
      rows.map((row) => {
        const payload = JSON.parse(row.payload) as { front?: string; statement?: string };
        return normalize(String((kind === "card" ? payload.front : payload.statement) ?? "")).text;
      }),
    );
  }
}
