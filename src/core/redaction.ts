/*
 * Filename: redaction.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { format } from "node:util";
import type { SecretStore } from "./secrets.js";

const KEY_PATTERN = /sk-or-[A-Za-z0-9_-]+/g;
export const MASK = "***";

/** Replaces the current key and anything shaped like an OpenRouter key. */
export function redact(text: string, secret: string | null): string {
  const cleaned = secret ? text.split(secret).join(MASK) : text;
  return cleaned.replace(KEY_PATTERN, MASK);
}

const METHODS = ["log", "info", "warn", "error", "debug"] as const;
type Method = (typeof METHODS)[number];

/** Wraps the console methods so no log line carries the key. Returns the function that undoes it. */
export function installLogRedaction(store: SecretStore, target: Console = console): () => void {
  const originals = new Map<Method, Console[Method]>();
  for (const method of METHODS) {
    const original = target[method].bind(target) as Console[Method];
    originals.set(method, target[method]);
    target[method] = (...args: unknown[]): void => {
      original(redact(format(...args), store.apiKey()));
    };
  }
  return () => {
    for (const [method, original] of originals) target[method] = original;
  };
}
