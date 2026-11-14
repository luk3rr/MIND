/*
 * Filename: privacy-log.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeProvider } from "./llm/fake.js";
import { setLogLevel } from "./logging.js";
import { loggedFetch } from "./net-log.js";
import { generationRig } from "./test/generation-fixture.js";
import type { GenerationRig } from "./test/generation-fixture.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  setLogLevel("warn");
  vi.restoreAllMocks();
  await rig?.core.close();
  rig = undefined;
});

function capture(): string[] {
  const lines: string[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation(
      (...args: unknown[]) => void lines.push(args.join(" ")),
    );
  }
  setLogLevel("debug");
  return lines;
}

describe("logs never carry what the user wrote or read", () => {
  it("logs the chat and database activity without the question, the answer or the excerpts", async () => {
    const lines = capture();
    const provider = new FakeProvider({ promptTokens: 7, completionTokens: 3, costUsd: 0.002 });
    provider.script("ChatAnswer", {
      supported: true,
      answer: "RESPOSTA-SECRETA sobre cloroplastos",
      citations: [{ chunk_id: 1, quote: "converte a energia da luz em energia química" }],
    });
    rig = generationRig({ provider });
    await rig.core.chat(rig.workspaceId).ask("PERGUNTA-SECRETA sobre fotossíntese e luz?");
    const text = lines.join("\n");
    expect(text).toContain("[chat] chat retrieval");
    expect(text).toContain("[chat] chat answered");
    expect(text).toContain("[db] sql");
    expect(text).not.toContain("SECRETA");
    expect(text).not.toContain("cloroplastos");
    expect(text).not.toContain("energia da luz");
  });

  it("logs each internet request with the host and, for the provider only, the path", async () => {
    const lines = capture();
    const ok = loggedFetch(() => Promise.resolve(new Response("{}", { status: 200 })), {
      withPath: true,
    });
    await ok("https://openrouter.ai/api/v1/chat/completions?token=segredo", { method: "POST" });
    const page = loggedFetch(() => Promise.resolve(new Response("{}", { status: 404 })), {
      withPath: false,
    });
    await page("https://exemplo.com/minha/pagina-privada?q=x", {});
    const broken = loggedFetch(() => Promise.reject(new TypeError("falha")), { withPath: false });
    await expect(broken("https://offline.test/x", {})).rejects.toThrow();
    const text = lines.join("\n");
    expect(text).toContain("to=openrouter.ai/api/v1/chat/completions status=200");
    expect(text).toContain("to=exemplo.com status=404");
    expect(text).toContain("to=offline.test error=TypeError");
    expect(text).not.toContain("segredo");
    expect(text).not.toContain("pagina-privada");
  });
});
