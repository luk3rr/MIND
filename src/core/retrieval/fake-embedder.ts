/*
 * Filename: fake-embedder.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { embeddingsUnavailable } from "./embeddings.js";
import type { EmbedHooks, Embedder } from "./embeddings.js";

const TOKEN = /[\p{L}\p{N}]+/gu;
const DIM = 64;

function hash(word: string): number {
  let value = 2166136261;
  for (const char of word) value = Math.imul(value ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  return value;
}

/**
 * A deterministic bag-of-words embedder with no model: the same words give similar vectors, so
 * tests and offline runs can exercise the semantic path. `stems` folds words that start the same
 * way (a crude stand-in for the synonyms a real model would find).
 */
export class FakeEmbedder implements Embedder {
  readonly modelName = "fake/bag-of-words";
  readonly calls: string[][] = [];
  ready: boolean;
  failWith: Error | null = null;

  constructor(options: { ready?: boolean; stem?: number } = {}) {
    this.ready = options.ready ?? true;
    this.stem = options.stem ?? 5;
  }

  private readonly stem: number;

  modelReady(): boolean {
    return this.ready;
  }

  embed(texts: readonly string[], hooks: EmbedHooks = {}): Promise<number[][]> {
    if (this.failWith) return Promise.reject(this.failWith);
    if (!this.ready) {
      if (!hooks.allowDownload) return Promise.reject(embeddingsUnavailable("Modelo ausente."));
      hooks.onProgress?.(0.5, "baixando o modelo de busca semântica");
      this.ready = true;
    }
    this.calls.push([...texts]);
    return Promise.resolve(
      texts.map((text) => {
        const vector = new Array<number>(DIM).fill(0);
        for (const word of text.toLowerCase().match(TOKEN) ?? []) {
          const index = hash(word.slice(0, this.stem)) % DIM;
          vector[index] = (vector[index] as number) + 1;
        }
        return vector;
      }),
    );
  }
}

/** Used when the app has no model worker (tests without an embedder): semantic search is off. */
export class UnavailableEmbedder implements Embedder {
  readonly modelName = "unavailable";

  modelReady(): boolean {
    return false;
  }

  embed(): Promise<number[][]> {
    return Promise.reject(embeddingsUnavailable("A busca semântica não está disponível."));
  }
}
