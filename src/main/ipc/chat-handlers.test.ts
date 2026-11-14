/*
 * Filename: chat-handlers.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { chunk, material } from "../../core/db/workspace-schema.js";
import { createCore } from "../../core/core.js";
import type { Core } from "../../core/core.js";
import { scriptedCardProvider } from "../../core/llm/scripted.js";
import { FakeEmbedder } from "../../core/retrieval/fake-embedder.js";
import { tempDir } from "../../core/test/helpers.js";
import { createHandlers } from "./handlers.js";
import { createRouter } from "./router.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

function setup() {
  core = createCore({
    dataDir: tempDir(),
    env: {},
    provider: scriptedCardProvider(),
    embedder: new FakeEmbedder({ ready: false }),
  });
  const workspaceId = core.registry.create("Chat").id;
  const { connection } = core.registry.open(workspaceId);
  const materialId = connection.db
    .insert(material)
    .values({ title: "Aula", kind: "md", filename: "a.md", storedPath: "a", status: "indexed" })
    .returning({ id: material.id })
    .get().id;
  connection.db
    .insert(chunk)
    .values({
      materialId,
      ordinal: 0,
      page: 3,
      text: "A mitocôndria é a organela responsável pela respiração celular da célula.",
    })
    .run();
  const dispatch = createRouter(
    createHandlers(core, { lastRoute: null }, { pickFiles: () => Promise.resolve([]) }),
    { error: () => undefined },
  );
  return { dispatch, workspaceId, core };
}

describe("chat channels (FR-18)", () => {
  it("answers with citations, keeps the history and clears it", async () => {
    const { dispatch, workspaceId } = setup();
    expect(await dispatch("chat:ask", { workspaceId, question: "   " })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "question" }] },
    });
    const reply = await dispatch("chat:ask", { workspaceId, question: "O que é a mitocôndria?" });
    expect(reply).toMatchObject({
      ok: true,
      data: {
        supported: true,
        citations: [{ materialTitle: "Aula", page: 3 }],
      },
    });
    expect(
      await dispatch("chat:ask", { workspaceId, question: "Xilofone zeppelin?" }),
    ).toMatchObject({
      data: { supported: false, citations: [] },
    });
    const history = await dispatch("chat:history", { workspaceId });
    expect((history as { data: { messages: unknown[] } }).data.messages).toHaveLength(2);
    expect(await dispatch("chat:clear", { workspaceId })).toEqual({
      ok: true,
      data: { cleared: 2 },
    });
    expect(await dispatch("chat:history", { workspaceId })).toEqual({
      ok: true,
      data: { messages: [] },
    });
  });
});

describe("embeddings channels", () => {
  it("enables with a job, reports progress in the status and disables", async () => {
    const { dispatch, workspaceId, core: built } = setup();
    expect(await dispatch("embeddings:status", { workspaceId })).toMatchObject({
      data: { modelReady: false, enabled: false, indexed: 0, total: 1 },
    });
    const enabled = await dispatch("embeddings:enable", { workspaceId });
    const jobId = (enabled as { data: { jobId: number } }).data.jobId;
    expect(jobId).toBeGreaterThan(0);
    await built.queue.wait(workspaceId, jobId);
    expect(await dispatch("embeddings:status", { workspaceId })).toMatchObject({
      data: { modelReady: true, enabled: true, indexed: 1 },
    });
    expect(await dispatch("embeddings:enable", { workspaceId })).toEqual({
      ok: true,
      data: { jobId: null },
    });
    expect(await dispatch("embeddings:disable", { workspaceId })).toEqual({ ok: true, data: {} });
    expect(await dispatch("embeddings:status", { workspaceId })).toMatchObject({
      data: { enabled: false },
    });
  });
});
