/*
 * Filename: embeddings.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../contracts/errors.js";
import { chunk, material } from "../db/workspace-schema.js";
import { JobCancelled } from "../jobs/queue.js";
import { createCore } from "../core.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { tempDir } from "../test/helpers.js";
import type { EmbedReply, EmbedRequest } from "./embed.worker.js";
import {
  EmbeddingRetriever,
  EmbeddingStore,
  HybridRetriever,
  dot,
  normalizeVector,
  pack,
  unpack,
} from "./embeddings.js";
import type { Embedder } from "./embeddings.js";
import { FakeEmbedder } from "./fake-embedder.js";
import { Bm25Retriever } from "./retriever.js";
import { MODEL_ID, TransformersEmbedder } from "./transformers-embedder.js";

const TEXTS = [
  "A mitocôndria gera energia para a célula.",
  "O DNA carrega a informação genética.",
  "O ribossomo sintetiza proteínas.",
];

/** Words of one topic share an axis, so "célula obtém energia" is close to the mitochondria text. */
class TopicEmbedder implements Embedder {
  readonly modelName = "topic/test";
  private static readonly AXES = [
    ["mitocôndria", "energia", "célula", "celula"],
    ["dna", "genética", "genetica", "informação"],
    ["ribossomo", "proteínas", "proteinas"],
  ];

  modelReady(): boolean {
    return true;
  }

  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(
      texts.map((text) => {
        const lower = text.toLowerCase();
        return TopicEmbedder.AXES.map((words) => words.filter((w) => lower.includes(w)).length);
      }),
    );
  }
}

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

function library() {
  rig = generationRig({ texts: TEXTS });
  const { connection } = rig.core.registry.open(rig.workspaceId);
  const second = connection.db
    .insert(material)
    .values({
      title: "Aula 2",
      kind: "md",
      filename: "b.md",
      storedPath: "b.md",
      status: "indexed",
    })
    .returning({ id: material.id })
    .get().id;
  connection.db
    .insert(chunk)
    .values({ materialId: second, ordinal: 0, page: 5, text: "A energia do ribossomo vem do ATP." })
    .run();
  return { connection, second };
}

describe("vector helpers", () => {
  it("stores normalized float32 vectors that round-trip", () => {
    const blob = pack([3, 4]);
    expect(blob.byteLength).toBe(8);
    expect([...unpack(blob)]).toEqual([expect.closeTo(0.6, 5), expect.closeTo(0.8, 5)]);
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
    expect(dot([1, 0], [0.5, 0.5])).toBe(0.5);
  });
});

describe("EmbeddingStore", () => {
  it("embeds only the pending chunks and reports progress", async () => {
    const { connection } = library();
    const store = new EmbeddingStore(connection, new TopicEmbedder());
    expect(store.status()).toEqual({
      modelReady: true,
      enabled: false,
      indexed: 0,
      total: 4,
      model: "topic/test",
    });
    const seen: number[] = [];
    expect(await store.indexPending({ onProgress: (progress) => seen.push(progress) })).toBe(4);
    expect(seen.at(-1)).toBe(1);
    expect(await store.indexPending()).toBe(0);
    expect(store.status().indexed).toBe(4);
    store.setEnabled(true);
    expect(store.enabled()).toBe(true);
    store.setEnabled(false);
    expect(store.enabled()).toBe(false);
  });

  it("indexes in batches of 32 and stops when cancelled", async () => {
    const { connection } = library();
    const many = Array.from({ length: 70 }, (_, i) => ({
      materialId: rig?.materialId as number,
      ordinal: 10 + i,
      page: 9,
      text: `texto ${i}`,
    }));
    connection.db.insert(chunk).values(many).run();
    const embedder = new FakeEmbedder();
    const store = new EmbeddingStore(connection, embedder);
    const controller = new AbortController();
    await store.indexPending({
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    expect(embedder.calls).toHaveLength(1);
    expect(embedder.calls[0]).toHaveLength(32);
    expect(store.status().indexed).toBe(32);
    await store.indexPending();
    expect(store.status().indexed).toBe(74);
  });
});

describe("EmbeddingRetriever", () => {
  it("ranks by cosine and respects the filters", async () => {
    const { connection, second } = library();
    const embedder = new TopicEmbedder();
    await new EmbeddingStore(connection, embedder).indexPending();
    const retriever = new EmbeddingRetriever(connection, embedder);
    const [best] = await retriever.search("Como a célula obtém energia?");
    expect(best).toMatchObject({ materialTitle: "Biologia", page: 1 });
    expect(best?.score).toBeCloseTo(1, 5);
    expect(
      (await retriever.search("energia", { materialIds: [second], limit: 5 }))[0]?.materialTitle,
    ).toBe("Aula 2");
    expect((await retriever.search("energia", { pageFrom: 5 }))[0]?.page).toBe(5);
    expect(await retriever.search("energia", { pageTo: 0 })).toEqual([]);
    expect(await retriever.search("   ")).toEqual([]);
    expect(await retriever.search("energia", { limit: 0 })).toEqual([]);
  });
});

describe("HybridRetriever", () => {
  it("fuses both rankings and keeps what only one of them finds", async () => {
    const { connection } = library();
    const embedder = new TopicEmbedder();
    await new EmbeddingStore(connection, embedder).indexPending();
    const hybrid = new HybridRetriever(
      new Bm25Retriever(connection),
      new EmbeddingRetriever(connection, embedder),
    );
    const found = await hybrid.search("informação genética", { limit: 3 });
    expect(found[0]?.text.startsWith("O DNA")).toBe(true);
    expect((found[0]?.score ?? 0) > (found.at(-1)?.score ?? 0)).toBe(true);
    expect(new Set(found.map((c) => c.chunkId)).size).toBe(found.length);
    // The semantic side finds "energia" for a question that has no word in common with the text.
    const semantic = await hybrid.search("obtenção de energia celular", { limit: 4 });
    expect(semantic.some((c) => c.text.startsWith("A mitocôndria"))).toBe(true);
  });

  it("falls back to BM25 when the model is unavailable but rethrows other errors", async () => {
    const { connection } = library();
    const broken = {
      search: () => Promise.reject(new AppError("EMBEDDINGS_UNAVAILABLE", "sem modelo")),
    };
    const lexical = new Bm25Retriever(connection);
    const fallback = await new HybridRetriever(lexical, broken).search("ribossomo proteínas");
    expect(fallback.map((c) => c.page).sort()).toEqual([3, 5]);
    const crashing = { search: () => Promise.reject(new Error("boom")) };
    await expect(new HybridRetriever(lexical, crashing).search("ribossomo")).rejects.toThrow(
      "boom",
    );
  });
});

describe("EmbeddingsService", () => {
  it("enables with a job that downloads the model and vectorizes, then disables", async () => {
    const embedder = new FakeEmbedder({ ready: false });
    rig = generationRig({ texts: TEXTS });
    const core = createCore({ dataDir: tempDir(), env: {}, embedder });
    const id = core.registry.create("Semântica").id;
    const { connection } = core.registry.open(id);
    const materialId = connection.db
      .insert(material)
      .values({ title: "x", kind: "md", filename: "x.md", storedPath: "x", status: "indexed" })
      .returning({ id: material.id })
      .get().id;
    connection.db
      .insert(chunk)
      .values(TEXTS.map((text, ordinal) => ({ materialId, ordinal, page: 1, text })))
      .run();
    const service = core.embeddings(id);
    expect(service.status()).toMatchObject({
      modelReady: false,
      enabled: false,
      indexed: 0,
      total: 3,
    });
    const jobId = service.enable();
    expect(jobId).not.toBeNull();
    await core.queue.wait(id, jobId as number);
    expect(service.status()).toMatchObject({ modelReady: true, enabled: true, indexed: 3 });
    expect(service.enable()).toBeNull();
    service.disable();
    expect(service.status().enabled).toBe(false);
    expect(service.retriever(new Bm25Retriever(connection))).toBeInstanceOf(Bm25Retriever);
    service.enable();
    expect(service.retriever(new Bm25Retriever(connection))).toBeInstanceOf(HybridRetriever);
    await core.close();
  });

  it("downloads the model even when there is nothing to vectorize yet", async () => {
    const embedder = new FakeEmbedder({ ready: false });
    const core = createCore({ dataDir: tempDir(), env: {}, embedder });
    const id = core.registry.create("Vazio").id;
    const jobId = core.embeddings(id).enable();
    await core.queue.wait(id, jobId as number);
    expect(embedder.modelReady()).toBe(true);
    await core.close();
  });

  it("is off by default and unavailable without an embedder", async () => {
    const core = createCore({ dataDir: tempDir(), env: {} });
    const id = core.registry.create("Sem modelo").id;
    expect(core.embeddings(id).status()).toMatchObject({
      modelReady: false,
      enabled: false,
      model: "unavailable",
    });
    await core.close();
  });
});

/** A worker that answers like embed.worker.ts without loading any model. */
class FakeWorker extends EventEmitter {
  readonly requests: EmbedRequest[] = [];
  terminated = false;
  reply: (request: EmbedRequest, send: (reply: EmbedReply) => void) => void = (request, send) =>
    send({ id: request.id, type: "result", vectors: request.texts.map(() => [1, 0]) });

  postMessage(request: EmbedRequest): void {
    this.requests.push(request);
    queueMicrotask(() => this.reply(request, (reply) => this.emit("message", reply)));
  }

  terminate(): Promise<number> {
    this.terminated = true;
    return Promise.resolve(0);
  }
}

describe("TransformersEmbedder", () => {
  function installedModels(): string {
    const dir = tempDir();
    const folder = join(dir, ...MODEL_ID.split("/"));
    mkdirSync(join(folder, "onnx"), { recursive: true });
    writeFileSync(join(folder, "config.json"), "{}");
    writeFileSync(join(folder, "onnx", "model_quantized.onnx"), "x");
    return dir;
  }

  it("knows whether the model is on disk and refuses to embed without it", async () => {
    const worker = new FakeWorker();
    const embedder = new TransformersEmbedder(tempDir(), () => worker as unknown as Worker);
    expect(embedder.modelReady()).toBe(false);
    await expect(embedder.embed(["a"])).rejects.toMatchObject({ code: "EMBEDDINGS_UNAVAILABLE" });
    expect(worker.requests).toHaveLength(0);
    expect(
      new TransformersEmbedder(installedModels(), () => worker as unknown as Worker).modelReady(),
    ).toBe(true);
  });

  it("sends the request with the model folder and download permission, one at a time", async () => {
    const worker = new FakeWorker();
    const models = installedModels();
    const embedder = new TransformersEmbedder(models, () => worker as unknown as Worker);
    const [a, b] = await Promise.all([embedder.embed(["um", "dois"]), embedder.embed(["três"])]);
    expect(a).toEqual([
      [1, 0],
      [1, 0],
    ]);
    expect(b).toEqual([[1, 0]]);
    expect(worker.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(worker.requests[0]).toMatchObject({
      modelName: MODEL_ID,
      cacheDir: models,
      allowDownload: false,
    });
    await embedder.embed(["x"], { allowDownload: true });
    expect(worker.requests[2]?.allowDownload).toBe(true);
  });

  it("downloads the model when allowed and reports progress", async () => {
    const worker = new FakeWorker();
    worker.reply = (request, send) => {
      send({ id: request.id, type: "progress", progress: 0.4, message: "baixando" });
      send({ id: request.id, type: "result", vectors: [[0, 1]] });
    };
    const embedder = new TransformersEmbedder(tempDir(), () => worker as unknown as Worker);
    const progress: [number, string][] = [];
    await embedder.embed(["a"], {
      allowDownload: true,
      onProgress: (p, m) => progress.push([p, m]),
    });
    expect(progress).toEqual([[0.4, "baixando"]]);
  });

  it("maps worker errors and recreates the worker after a crash", async () => {
    const workers: FakeWorker[] = [];
    let behaviour: FakeWorker["reply"] = (request, send) =>
      send({ id: request.id, type: "result", vectors: request.texts.map(() => [1, 0]) });
    const embedder = new TransformersEmbedder(installedModels(), () => {
      const worker = new FakeWorker();
      worker.reply = (request, send) => behaviour(request, send);
      workers.push(worker);
      return worker as unknown as Worker;
    });
    behaviour = (request, send) =>
      send({
        id: request.id,
        type: "error",
        code: "EMBEDDINGS_UNAVAILABLE",
        message: "sem modelo",
      });
    await expect(embedder.embed(["a"])).rejects.toMatchObject({
      code: "EMBEDDINGS_UNAVAILABLE",
      message: "sem modelo",
    });
    behaviour = (request, send) =>
      send({ id: request.id, type: "result", vectors: request.texts.map(() => [1, 0]) });
    await expect(embedder.embed(["b"])).resolves.toEqual([[1, 0]]);
    behaviour = (request, send) => send({ id: request.id, type: "error", message: "falha" });
    await expect(embedder.embed(["c"])).rejects.toThrow("falha");
    // A crash rejects what is waiting and the next request starts a new worker.
    behaviour = () => undefined;
    const crashed = embedder.embed(["d"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    (workers[0] as FakeWorker).emit("error", new Error("crash"));
    await expect(crashed).rejects.toThrow("crash");
    expect((workers[0] as FakeWorker).terminated).toBe(true);
    behaviour = (request, send) =>
      send({ id: request.id, type: "result", vectors: request.texts.map(() => [1, 0]) });
    await expect(embedder.embed(["e"])).resolves.toEqual([[1, 0]]);
    expect(workers).toHaveLength(2);
    embedder.close();
  });

  it("cancels a request by terminating the worker", async () => {
    const worker = new FakeWorker();
    worker.reply = () => undefined;
    const embedder = new TransformersEmbedder(installedModels(), () => worker as unknown as Worker);
    const controller = new AbortController();
    const waiting = embedder.embed(["a"], { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(JobCancelled);
    expect(worker.terminated).toBe(true);
    const aborted = new AbortController();
    aborted.abort();
    await expect(embedder.embed(["b"], { signal: aborted.signal })).rejects.toBeInstanceOf(
      JobCancelled,
    );
  });

  it("drops the idle worker after a minute", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const embedder = new TransformersEmbedder(
        installedModels(),
        () => worker as unknown as Worker,
      );
      const promise = embedder.embed(["a"]);
      await vi.advanceTimersByTimeAsync(0);
      await promise;
      await vi.advanceTimersByTimeAsync(60_001);
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when the worker exits on its own", async () => {
    const worker = new FakeWorker();
    worker.reply = () => undefined;
    const embedder = new TransformersEmbedder(installedModels(), () => worker as unknown as Worker);
    const waiting = embedder.embed(["a"]);
    await Promise.resolve();
    worker.emit("exit", 1);
    await expect(waiting).rejects.toThrow(/stopped/);
  });
});

describe("FakeEmbedder", () => {
  it("needs the download permission to become ready and is deterministic", async () => {
    const embedder = new FakeEmbedder({ ready: false });
    await expect(embedder.embed(["energia"])).rejects.toMatchObject({
      code: "EMBEDDINGS_UNAVAILABLE",
    });
    const first = await embedder.embed(["energia solar"], {
      allowDownload: true,
      onProgress: () => undefined,
    });
    const again = await embedder.embed(["energia solar"]);
    expect(first).toEqual(again);
    embedder.failWith = new Error("quebrou");
    await expect(embedder.embed(["x"])).rejects.toThrow("quebrou");
  });
});
