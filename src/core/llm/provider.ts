/*
 * Filename: provider.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { z } from "zod";
import type { Message, Usage } from "./types.js";

export interface CompleteOptions {
  model: string;
  /** Extra attempts after an answer that fails validation. */
  maxRetries?: number;
  /** Name given to the JSON Schema sent to the model. */
  schemaName?: string;
  /** What the call is for; recorded in the cost ledger. */
  purpose?: string;
  /** Caps what the model may write, reasoning included. */
  maxTokens?: number;
  /** For models that reason before answering: how hard they should. Ignored by the others. */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface Completion<T> {
  value: T;
  usage: Usage;
}

/** The single door to language models: asks for a structured answer validated by a schema. */
export interface Provider {
  readonly name: string;
  readonly requiresConsent: boolean;
  complete<T>(
    messages: readonly Message[],
    schema: z.ZodType<T>,
    options: CompleteOptions,
  ): Promise<Completion<T>>;
}
