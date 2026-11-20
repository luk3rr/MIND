/*
 * Filename: fake.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { z } from "zod";
import { AppError } from "../contracts/errors.js";
import type { Completion, CompleteOptions, Provider } from "./provider.js";
import type { Message, Usage } from "./types.js";

export interface Call {
  messages: Message[];
  schemaName: string | undefined;
  model: string;
}

type Handler = (messages: readonly Message[], model: string) => unknown;

/** Answers with scripted responses chosen by the schema name; never touches the network. */
export class FakeProvider implements Provider {
  readonly name: string;
  readonly requiresConsent: boolean = false;
  readonly calls: Call[] = [];
  private readonly handlers = new Map<string, Handler>();

  constructor(
    private readonly usage: Usage = { promptTokens: 10, completionTokens: 5, costUsd: null },
    private readonly latencyMs = 0,
    name = "fake",
  ) {
    this.name = name;
  }

  /** Registers a constant answer or a function of (messages, model) for a schema name. */
  script(schemaName: string, response: unknown | Handler): void {
    this.handlers.set(
      schemaName,
      typeof response === "function" ? (response as Handler) : () => response,
    );
  }

  async complete<T>(
    messages: readonly Message[],
    schema: z.ZodType<T>,
    options: CompleteOptions,
  ): Promise<Completion<T>> {
    this.calls.push({
      messages: [...messages],
      schemaName: options.schemaName,
      model: options.model,
    });
    if (this.latencyMs) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const handler = this.handlers.get(options.schemaName ?? "Response");
    if (!handler) {
      throw new AppError(
        "PROVIDER_ERROR",
        `No scripted response for ${options.schemaName ?? "Response"}.`,
      );
    }
    return { value: schema.parse(handler(messages, options.model)), usage: { ...this.usage } };
  }
}
