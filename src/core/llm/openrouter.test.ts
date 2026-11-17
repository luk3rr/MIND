/*
 * Filename: openrouter.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../contracts/errors.js";
import { SecretStore } from "../secrets.js";
import { tempDir } from "../test/helpers.js";
import { join } from "node:path";
import { OpenRouterProvider, extractJson } from "./openrouter.js";
import type { FetchLike } from "./openrouter.js";

const Card = z.object({ front: z.string(), back: z.string() });
const KEY = "sk-or-v1-test";

function reply(content: string, usage: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
    status: 200,
  });
}

function setup(responses: (Response | Error)[], withKey = true) {
  const secrets = new SecretStore(join(tempDir(), "ai"), {});
  if (withKey) secrets.save(KEY);
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    [];
  const queue = [...responses];
  const fetchImpl: FetchLike = (url, init) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: init.headers as Record<string, string>,
    });
    const next = queue.shift();
    if (next === undefined) throw new Error("no more scripted responses");
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  const sleep = vi.fn(() => Promise.resolve());
  const provider = new OpenRouterProvider(secrets, { fetch: fetchImpl, sleep, retryDelayMs: 0 });
  return { provider, calls, sleep };
}

const messages = [{ role: "user" as const, content: "Make a card" }];
const options = { model: "m/x", schemaName: "Card" };

describe("extractJson", () => {
  it("accepts plain JSON and a fenced block", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('```\n{"a":3}\n```')).toEqual({ a: 3 });
    expect(() => extractJson("not json")).toThrow();
  });
});

describe("OpenRouterProvider", () => {
  it("sends a structured request and returns the value with usage", async () => {
    const { provider, calls } = setup([
      reply('{"front":"Q","back":"A"}', { prompt_tokens: 12, completion_tokens: 7, cost: 0.0042 }),
    ]);
    const result = await provider.complete(messages, Card, options);
    expect(result.value).toEqual({ front: "Q", back: "A" });
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 7, costUsd: 0.0042 });
    const call = calls[0];
    expect(call?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call?.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(call?.body["model"]).toBe("m/x");
    expect(call?.body["usage"]).toEqual({ include: true });
    expect(call?.body["response_format"]).toMatchObject({
      type: "json_schema",
      json_schema: { name: "Card", strict: false },
    });
  });

  it("falls back to a schema instruction when structured mode is unsupported", async () => {
    const { provider, calls } = setup([
      new Response('{"error":"unsupported response_format"}', { status: 400 }),
      reply('{"front":"Q","back":"A"}'),
    ]);
    const result = await provider.complete(messages, Card, options);
    expect(result.value.front).toBe("Q");
    expect(calls[1]?.body["response_format"]).toBeUndefined();
    const sent = calls[1]?.body["messages"] as { role: string; content: string }[];
    expect(sent[0]?.role).toBe("system");
    expect(sent[0]?.content).toContain("JSON Schema");
  });

  it("retries an invalid answer with the validation error and accumulates usage", async () => {
    const { provider, calls } = setup([
      reply("not json", { prompt_tokens: 5, completion_tokens: 1 }),
      reply('{"front":"Q","back":"A"}', { prompt_tokens: 6, completion_tokens: 2 }),
    ]);
    const result = await provider.complete(messages, Card, options);
    expect(result.usage).toMatchObject({ promptTokens: 11, completionTokens: 3 });
    const second = calls[1]?.body["messages"] as { role: string; content: string }[];
    expect(second.at(-1)?.content).toContain("previous answer was invalid");
    expect(second.at(-2)).toMatchObject({ role: "assistant", content: "not json" });
  });

  it("gives up after the retry budget with a stable error", async () => {
    const { provider } = setup([reply("x"), reply("y"), reply("z")]);
    await expect(
      provider.complete(messages, Card, { ...options, maxRetries: 2 }),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: expect.stringContaining("3 tentativas"),
    });
  });

  it("retries a rate limit once and then succeeds", async () => {
    const { provider, sleep } = setup([
      new Response("slow down", { status: 429 }),
      reply('{"front":"Q","back":"A"}'),
    ]);
    await provider.complete(messages, Card, options);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("turns a persistent server error and a network failure into provider errors", async () => {
    const server = setup([new Response("", { status: 503 }), new Response("", { status: 503 })]);
    await expect(server.provider.complete(messages, Card, options)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: expect.stringContaining("HTTP 503"),
    });
    const network = setup([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    await expect(network.provider.complete(messages, Card, options)).rejects.toMatchObject({
      message: expect.stringContaining("falha de rede"),
    });
  });

  it("turns an answer that stalls after the headers into a provider error to retry", async () => {
    const stalled = (name: string): Response => {
      const response = new Response("{}", { status: 200 });
      response.text = () => Promise.reject(new DOMException("aborted", name));
      return response;
    };
    const timeout = setup([stalled("TimeoutError")]);
    const error = await timeout.provider.complete(messages, Card, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "O provedor demorou mais de 120 s para responder. Tente de novo.",
    });
    const dropped = setup([stalled("NetworkError")]);
    await expect(dropped.provider.complete(messages, Card, options)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: expect.stringContaining("A conexão com o provedor caiu"),
    });
  });

  it.each([401, 403])("reports a rejected key (%i) without leaking it", async (status) => {
    const { provider } = setup([new Response("nope", { status })]);
    const error = await provider.complete(messages, Card, options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).not.toContain(KEY);
    expect((error as AppError).message).toContain("Chave de API inválida");
  });

  it("never reaches the network without a key", async () => {
    const { provider, calls } = setup([], false);
    await expect(provider.complete(messages, Card, options)).rejects.toMatchObject({
      code: "PROVIDER_KEY_MISSING",
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [new Response("<html>", { status: 200 }), "ilegível"],
    [new Response("{}", { status: 200 }), "sem conteúdo"],
    [new Response("{}", { status: 404 }), "HTTP 404"],
  ])("reports unexpected responses as provider errors", async (response, text) => {
    const { provider } = setup([response]);
    await expect(provider.complete(messages, Card, options)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: expect.stringContaining(text),
    });
  });

  it("keeps the cost as null when the provider reports none", async () => {
    const { provider } = setup([reply('{"front":"Q","back":"A"}', { prompt_tokens: 3 })]);
    const result = await provider.complete(messages, Card, options);
    expect(result.usage.costUsd).toBeNull();
  });
});
