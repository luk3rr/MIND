/*
 * Filename: embed.worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { parentPort } from "node:worker_threads";

/** What the main process sends: texts to embed with the model folder and whether to download. */
export interface EmbedRequest {
  id: number;
  texts: string[];
  modelName: string;
  cacheDir: string;
  allowDownload: boolean;
}

export type EmbedReply =
  | { id: number; type: "progress"; progress: number; message: string }
  | { id: number; type: "result"; vectors: number[][] }
  | { id: number; type: "error"; code?: "EMBEDDINGS_UNAVAILABLE"; message: string };

interface Extractor {
  (
    texts: string[],
    options: { pooling: "mean"; normalize: boolean },
  ): Promise<{
    tolist(): number[][];
  }>;
}

const SUB_BATCH = 8;
const port = parentPort;
if (!port) throw new Error("embed.worker must run inside a worker thread");

let extractor: Promise<Extractor> | null = null;
let loadedKey = "";

/** Loads the quantized model once per worker; downloads it only when the caller allows. */
function load(request: EmbedRequest, send: (reply: EmbedReply) => void): Promise<Extractor> {
  const key = `${request.modelName}|${request.cacheDir}|${request.allowDownload}`;
  if (extractor && loadedKey === key) return extractor;
  loadedKey = key;
  extractor = (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = request.cacheDir;
    env.localModelPath = request.cacheDir;
    env.allowLocalModels = true;
    env.allowRemoteModels = request.allowDownload;
    const files = new Map<string, { loaded: number; total: number }>();
    let lastSent = -1;
    const made = await pipeline("feature-extraction", request.modelName, {
      dtype: "q8",
      progress_callback: (event: {
        status: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (event.status !== "progress" || !event.file) return;
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total ?? 0 });
        const all = [...files.values()];
        const total = all.reduce((sum, f) => sum + f.total, 0);
        const loaded = all.reduce((sum, f) => sum + f.loaded, 0);
        const progress = total ? Math.min(0.99, loaded / total) : 0;
        // The download reports every few kilobytes; one message per percent is plenty.
        if (progress - lastSent < 0.01) return;
        lastSent = progress;
        send({
          id: request.id,
          type: "progress",
          progress,
          message: "baixando o modelo de busca semântica",
        });
      },
    });
    return made as unknown as Extractor;
  })();
  extractor.catch(() => {
    extractor = null;
  });
  return extractor;
}

port.on("message", (request: EmbedRequest) => {
  const send = (reply: EmbedReply): void => port.postMessage(reply);
  void (async () => {
    try {
      const model = await load(request, send);
      const vectors: number[][] = [];
      for (let start = 0; start < request.texts.length; start += SUB_BATCH) {
        const output = await model(request.texts.slice(start, start + SUB_BATCH), {
          pooling: "mean",
          normalize: true,
        });
        vectors.push(...output.tolist());
      }
      send({ id: request.id, type: "result", vectors });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send({
        id: request.id,
        type: "error",
        ...(request.allowDownload ? {} : { code: "EMBEDDINGS_UNAVAILABLE" as const }),
        message,
      });
    }
  })();
});
