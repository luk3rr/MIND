/*
 * Filename: service.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";
import { draftProblem } from "../authoring/validate.js";
import type { ItemDraft } from "../authoring/validate.js";
import { AppError } from "../contracts/errors.js";
import type { Llm } from "../core.js";
import { optionOutSchema } from "../generation/schemas.js";
import { logger } from "../logging.js";
import type { Message } from "../llm/types.js";
import { buildAssistMessages, MAX_ASSIST_INSTRUCTION } from "./prompts.js";
import type { AssistAction } from "./prompts.js";

const log = logger("assist");

const cardAnswer = z.object({ front: z.string(), back: z.string() });
const questionAnswer = z.object({
  statement: z.string(),
  options: z.array(optionOutSchema.pick({ key: true, text: true, why: true })).default([]),
  answer: z.string(),
  explanation: z.string(),
});

export interface AssistRequest {
  action: AssistAction;
  /** What the person wants, for the "adjust" action. */
  instruction?: string | undefined;
  draft: ItemDraft;
  topic?: string | null | undefined;
  /** The passage of the material the item is based on, when there is one. */
  quote?: string | undefined;
}

export interface Proposal {
  proposal: ItemDraft;
  costUsd: number | null;
}

/**
 * Asks the model to improve, fix or adjust the text of one item and checks the answer; it only
 * proposes, never stores. Only the text of the item, its topic, its quote and the request are
 * sent, and none of it is logged.
 */
export class AssistService {
  constructor(private readonly llm: Llm) {}

  async improve(request: AssistRequest): Promise<Proposal> {
    this.check(request);
    this.llm.ensureReady();
    const model = this.llm.settings.get().generationModel;
    log.info("assist requested", {
      action: request.action,
      kind: request.draft.kind,
      subtype: request.draft.subtype,
      model,
    });
    const messages = buildAssistMessages(request);
    let cost: number | null = null;
    let problem = "";
    // One more attempt when the proposal breaks the rules of the type; the model is told why.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sent: Message[] =
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "user",
                content: `Your previous answer is not valid: ${problem} Answer again, fixing it.`,
              },
            ];
      const { draft, usage } = await this.ask(request.draft, sent, model);
      if (usage !== null) cost = (cost ?? 0) + usage;
      const found = draftProblem(draft);
      if (found === null) {
        log.info("assist answered", { attempts: attempt + 1 });
        return { proposal: draft, costUsd: cost };
      }
      problem = found.message;
    }
    log.warn("assist answer refused", { kind: request.draft.kind });
    throw new AppError(
      "PROVIDER_ERROR",
      "O modelo devolveu uma resposta inválida. O item não foi alterado; tente de novo.",
    );
  }

  private check(request: AssistRequest): void {
    const { draft } = request;
    if (request.action === "adjust" && !request.instruction?.trim()) {
      const message = "Descreva o ajuste que você quer.";
      throw new AppError("VALIDATION_ERROR", message, [{ field: "instruction", message }]);
    }
    if ((request.instruction?.length ?? 0) > MAX_ASSIST_INSTRUCTION) {
      const message = `Use até ${MAX_ASSIST_INSTRUCTION} caracteres.`;
      throw new AppError("VALIDATION_ERROR", message, [{ field: "instruction", message }]);
    }
    const text = draft.kind === "card" ? `${draft.front}${draft.back}` : draft.statement;
    if (!text.trim()) {
      const message = "Escreva o texto antes de pedir ajuda ao modelo.";
      throw new AppError("VALIDATION_ERROR", message, [
        { field: draft.kind === "card" ? "front" : "statement", message },
      ]);
    }
  }

  private async ask(
    original: ItemDraft,
    messages: readonly Message[],
    model: string,
  ): Promise<{ draft: ItemDraft; usage: number | null }> {
    if (original.kind === "card") {
      const { value, usage } = await this.llm.provider.complete(messages, cardAnswer, {
        model,
        purpose: "assist",
        schemaName: "AssistCard",
      });
      return {
        draft: { kind: "card", subtype: original.subtype, front: value.front, back: value.back },
        usage: usage.costUsd,
      };
    }
    const { value, usage } = await this.llm.provider.complete(messages, questionAnswer, {
      model,
      purpose: "assist",
      schemaName: "AssistQuestion",
    });
    return {
      draft: {
        kind: "question",
        subtype: original.subtype,
        statement: value.statement,
        options: original.subtype === "certo_errado" ? [] : value.options,
        answer: value.answer,
        explanation: value.explanation,
      },
      usage: usage.costUsd,
    };
  }
}
