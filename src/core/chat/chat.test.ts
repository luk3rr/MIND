/*
 * Filename: chat.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chatMessage } from "../db/workspace-schema.js";
import { FakeProvider } from "../llm/fake.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { buildChatMessages, CHAT_SYSTEM } from "./prompts.js";
import { NO_SUPPORT } from "./service.js";

const MITOCHONDRIA =
  "A mitocôndria é a organela responsável pela respiração celular e produz a maior parte da energia da célula.";
const NUCLEUS = "O núcleo guarda o material genético da célula e coordena a divisão celular.";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function setup(usage = { promptTokens: 0, completionTokens: 0, costUsd: 0 }) {
  const provider = new FakeProvider(usage);
  rig = generationRig({ provider, texts: [MITOCHONDRIA, NUCLEUS] });
  return { provider, chat: rig.core.chat(rig.workspaceId), ids: rig.chunkIds };
}

describe("chat prompt (golden values from the Python implementation)", () => {
  const golden = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "prompts.json"), "utf8"),
  ) as {
    chunks: { id: number; label: string; text: string }[];
    chat_system: string;
    chat_question: string;
    chat_messages: { role: string; content: string }[];
  };

  it("builds the same messages", () => {
    expect(buildChatMessages(golden.chat_question, golden.chunks)).toEqual(golden.chat_messages);
    expect(CHAT_SYSTEM).toBe(golden.chat_system);
  });
});

describe("ChatService (FR-18)", () => {
  it("keeps only verified, distinct citations of a supported answer", async () => {
    const { provider, chat, ids } = setup({ promptTokens: 10, completionTokens: 5, costUsd: 0.01 });
    const mito = ids[0] as number;
    provider.script("ChatAnswer", {
      supported: true,
      answer: "A mitocôndria produz energia.",
      citations: [
        { chunk_id: mito, quote: "produz a maior parte da energia" },
        { chunk_id: mito, quote: "texto inventado que não existe" },
        { chunk_id: 999, quote: "produz a maior parte da energia" },
        { chunk_id: mito, quote: "produz a maior parte da energia" },
      ],
    });
    const reply = await chat.ask("  O que a mitocôndria faz? ");
    expect(reply).toMatchObject({
      supported: true,
      question: "O que a mitocôndria faz?",
      costUsd: 0.01,
    });
    expect(reply.citations).toEqual([
      {
        chunkId: mito,
        materialId: rig?.materialId,
        materialTitle: "Biologia",
        page: 1,
        section: null,
        quote: "produz a maior parte da energia",
      },
    ]);
    const sent = provider.calls[0];
    expect(sent?.model).toBe(rig?.core.llm.settings.get().generationModel);
    expect(sent?.messages[1]?.content).toContain(MITOCHONDRIA);
    expect(sent?.messages[1]?.content).toContain("Question: O que a mitocôndria faz?");
  });

  it("does not call the model when nothing is retrieved", async () => {
    const { provider, chat } = setup();
    const reply = await chat.ask("Xilofone zeppelin?");
    expect([reply.answer, reply.supported, reply.citations]).toEqual([NO_SUPPORT, false, []]);
    expect(provider.calls).toHaveLength(0);
  });

  it.each([
    [{ supported: false, answer: "Não sei.", citations: [] }],
    [{ supported: true, answer: "Resposta sem fonte.", citations: [] }],
    [
      {
        supported: true,
        answer: "   ",
        citations: [{ chunk_id: 1, quote: "produz a maior parte da energia" }],
      },
    ],
    [
      {
        supported: true,
        answer: "Citação falsa.",
        citations: [{ chunk_id: 1, quote: "isto não aparece em lugar nenhum" }],
      },
    ],
  ])("turns an unsupported or uncited answer into the refusal (%#)", async (answer) => {
    const { provider, chat } = setup();
    provider.script("ChatAnswer", answer);
    const reply = await chat.ask("O que a mitocôndria faz?");
    expect([reply.answer, reply.supported, reply.citations]).toEqual([NO_SUPPORT, false, []]);
    expect(provider.calls).toHaveLength(1);
  });

  it("validates questions and persists messages, history and clear", async () => {
    const { provider, chat, ids } = setup();
    await expect(chat.ask("   ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: [{ field: "question" }],
    });
    await expect(chat.ask("x".repeat(1001))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    provider.script("ChatAnswer", {
      supported: true,
      answer: "Guarda o material genético.",
      citations: [{ chunk_id: ids[1], quote: "guarda o material gen" }],
    });
    // The quote is shorter than 15 characters after normalizing? It is 21, so it is accepted.
    await chat.ask("O que o núcleo guarda?");
    await chat.ask("Xilofone zeppelin?");
    const history = chat.history();
    expect(history.map((m) => m.question)).toEqual([
      "O que o núcleo guarda?",
      "Xilofone zeppelin?",
    ]);
    expect(history[0]?.citations[0]?.page).toBe(2);
    expect(
      rig?.core.registry.open(rig.workspaceId).connection.db.select().from(chatMessage).all(),
    ).toHaveLength(2);
    expect(chat.clear()).toBe(2);
    expect(chat.history()).toEqual([]);
  });

  it("limits the history to the latest messages, oldest first", async () => {
    const { chat } = setup();
    for (let i = 1; i <= 3; i += 1) await chat.ask(`Pergunta sem trecho ${i}xyz?`);
    expect(chat.history(2).map((m) => m.question)).toEqual([
      "Pergunta sem trecho 2xyz?",
      "Pergunta sem trecho 3xyz?",
    ]);
  });

  it("refuses to call the model when the provider is not ready", async () => {
    rig = generationRig({ texts: [MITOCHONDRIA], provider: new FakeProvider() });
    const real = rig.core.llm;
    const original = real.ensureReady;
    real.ensureReady = () => {
      throw Object.assign(new Error("sem chave"), { code: "PROVIDER_KEY_MISSING" });
    };
    await expect(rig.core.chat(rig.workspaceId).ask("mitocôndria?")).rejects.toMatchObject({
      code: "PROVIDER_KEY_MISSING",
    });
    real.ensureReady = original;
  });
});
