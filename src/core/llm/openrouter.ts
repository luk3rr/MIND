/*
 * Filename: openrouter.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";
import { AppError } from "../contracts/errors.js";
import type { SecretStore } from "../secrets.js";
import type { Completion, CompleteOptions, Provider } from "./provider.js";
import type { Message, Usage } from "./types.js";
import { emptyUsage } from "./types.js";
import { logger, since } from "../logging.js";

const log = logger("llm");

export const BASE_URL = "https://openrouter.ai/api/v1";
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Parses a JSON answer, tolerating a markdown code fence around it. */
export function extractJson(text: string): unknown {
  const stripped = text.trim();
  const fenced = FENCE.exec(stripped);
  return JSON.parse(fenced?.[1] ?? stripped);
}

function schemaInstruction(jsonSchema: unknown): string {
  return (
    "Reply with ONLY a JSON object that validates against this JSON Schema, " +
    `with no extra text:\n${JSON.stringify(jsonSchema)}`
  );
}

interface Payload {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number | null };
}

export interface OpenRouterOptions {
  fetch?: FetchLike;
  baseUrl?: string;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  readonly requiresConsent = true;
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(
    private readonly secrets: SecretStore,
    options: OpenRouterOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init));
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /** Logs the call (purpose, model, tokens, cost, time) but never the messages or the answer. */
  async complete<T>(
    messages: readonly Message[],
    schema: z.ZodType<T>,
    options: CompleteOptions,
  ): Promise<Completion<T>> {
    const started = performance.now();
    const fields = { purpose: options.purpose ?? "unknown", model: options.model };
    try {
      const result = await this.run(messages, schema, options);
      log.info("model call ok", {
        ...fields,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd: result.usage.costUsd ?? 0,
        ms: since(started),
      });
      return result;
    } catch (error) {
      log.warn("model call failed", {
        ...fields,
        code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        ms: since(started),
      });
      throw error;
    }
  }

  private async run<T>(
    messages: readonly Message[],
    schema: z.ZodType<T>,
    options: CompleteOptions,
  ): Promise<Completion<T>> {
    const key = this.secrets.apiKey();
    if (key === null) {
      throw new AppError(
        "PROVIDER_KEY_MISSING",
        "Configure a chave do OpenRouter em Configurações.",
      );
    }
    const maxRetries = options.maxRetries ?? 2;
    const jsonSchema = z.toJSONSchema(schema);
    let conversation: Message[] = messages.map((message) => ({ ...message }));
    let structured = true;
    const total = emptyUsage();
    let lastError = "resposta vazia";

    for (let attempt = 0; attempt <= maxRetries;) {
      const body = this.body(options, conversation, jsonSchema, structured);
      const response = await this.post(key, body);
      const text = await this.readBody(response);
      if (response.status === 400 && structured && text.includes("response_format")) {
        structured = false;
        log.info("model without structured output, retrying with a schema in the prompt", {
          model: options.model,
        });
        continue;
      }
      const payload = this.okPayload(response.status, text);
      accumulate(total, payload.usage);
      const content = this.content(payload);
      try {
        return { value: schema.parse(extractJson(content)), usage: total };
      } catch (error) {
        lastError =
          (error instanceof Error ? error.message : String(error)).split("\n")[0]?.slice(0, 200) ??
          "";
        conversation = [
          ...conversation,
          { role: "assistant", content },
          {
            role: "user",
            content: `Your previous answer was invalid (${lastError}). Reply again with ONLY valid JSON.`,
          },
        ];
        attempt += 1;
        log.warn("invalid model answer, asking again", {
          purpose: options.purpose ?? "unknown",
          attempt,
          reason: lastError,
        });
      }
    }
    throw new AppError(
      "PROVIDER_ERROR",
      `O modelo não devolveu uma resposta válida após ${maxRetries + 1} tentativas (${lastError}).`,
    );
  }

  private body(
    options: CompleteOptions,
    conversation: Message[],
    jsonSchema: unknown,
    structured: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = { model: options.model, usage: { include: true } };
    if (structured) {
      body["messages"] = conversation;
      body["response_format"] = {
        type: "json_schema",
        json_schema: { name: options.schemaName ?? "Response", strict: false, schema: jsonSchema },
      };
    } else {
      body["messages"] = [
        { role: "system", content: schemaInstruction(jsonSchema) },
        ...conversation,
      ];
    }
    return body;
  }

  private async post(key: string, body: Record<string, unknown>): Promise<Response> {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "X-Title": "MIND",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    let problem = "falha de rede";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, init);
        if (!RETRY_STATUSES.has(response.status)) return response;
        problem = `HTTP ${response.status}`;
      } catch (error) {
        problem = `falha de rede (${error instanceof Error ? error.name : "erro"})`;
      }
      log.warn("provider request failed", { problem, attempt: attempt + 1 });
      if (attempt === 0) await this.sleep(this.retryDelayMs);
    }
    throw new AppError("PROVIDER_ERROR", `O provedor não respondeu: ${problem}.`);
  }

  /**
   * Reads the answer. The time limit also covers this part, so a provider that sends the headers
   * and then stalls ends here, and it must reach the person as a provider problem to retry.
   */
  private async readBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      log.warn("provider answer not read", { problem: name || "erro" });
      throw new AppError(
        "PROVIDER_ERROR",
        name === "TimeoutError" || name === "AbortError"
          ? `O provedor demorou mais de ${Math.round(this.timeoutMs / 1000)} s para responder. Tente de novo.`
          : "A conexão com o provedor caiu antes do fim da resposta. Tente de novo.",
      );
    }
  }

  private okPayload(status: number, text: string): Payload {
    if (status === 401 || status === 403) {
      throw new AppError("PROVIDER_ERROR", "Chave de API inválida ou sem permissão.");
    }
    if (status >= 400) {
      throw new AppError("PROVIDER_ERROR", `O provedor recusou a requisição (HTTP ${status}).`);
    }
    try {
      return JSON.parse(text) as Payload;
    } catch {
      throw new AppError("PROVIDER_ERROR", "O provedor devolveu uma resposta ilegível.");
    }
  }

  private content(payload: Payload): string {
    const content = payload.choices?.[0]?.message?.content;
    if (payload.choices?.[0]?.message === undefined) {
      throw new AppError("PROVIDER_ERROR", "O provedor devolveu uma resposta sem conteúdo.");
    }
    return content ?? "";
  }
}

function accumulate(total: Usage, usage: Payload["usage"]): void {
  total.promptTokens += Number(usage?.prompt_tokens ?? 0);
  total.completionTokens += Number(usage?.completion_tokens ?? 0);
  const cost = usage?.cost;
  if (cost !== undefined && cost !== null) total.costUsd = (total.costUsd ?? 0) + Number(cost);
}
