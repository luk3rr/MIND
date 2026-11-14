/*
 * Filename: core/llm/connection.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { testConnection } from "./connection.js";

const secrets = (key: string | null) => ({ apiKey: () => key }) as never;
const respond = (status: number) => () => Promise.resolve(new Response("{}", { status }));

describe("testConnection", () => {
  it("reports a missing key without calling the network", async () => {
    let calls = 0;
    const result = await testConnection(secrets(null), () => {
      calls += 1;
      return Promise.resolve(new Response("{}"));
    });
    expect(result).toEqual({ ok: false, message: "Nenhuma chave configurada." });
    expect(calls).toBe(0);
  });

  it("sends only the key and accepts a 200", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const result = await testConnection(
      secrets("sk-or-abc"),
      (url, init) => {
        seen = { url, auth: new Headers(init.headers).get("authorization") };
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
      "https://example.test/api",
    );
    expect(result.ok).toBe(true);
    expect(seen).toEqual({ url: "https://example.test/api/auth/key", auth: "Bearer sk-or-abc" });
  });

  it.each([
    [401, /recusou a chave/],
    [403, /recusou a chave/],
    [500, /erro 500/],
  ])("explains status %i", async (status, message) => {
    const result = await testConnection(secrets("k"), respond(status));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(message);
  });

  it("explains a network failure", async () => {
    const result = await testConnection(secrets("k"), () => Promise.reject(new Error("offline")));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("rede") });
  });
});
