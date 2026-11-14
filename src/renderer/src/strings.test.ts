/*
 * Filename: strings.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { T } from "./strings.js";

function collect(value: unknown, path: string, out: [string, string][]): void {
  if (typeof value === "string") out.push([path, value]);
  else if (typeof value === "function") {
    out.push([path, String((value as (...args: unknown[]) => unknown)(3, 2, 1))]);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, inner] of Object.entries(value)) collect(inner, `${path}.${key}`, out);
  }
}

// English words that would show a string was left untranslated (NFR-13). Product names such as
// OpenRouter, FSRS or MIND are not in the list on purpose.
const ENGLISH =
  /\b(the|and|loading|error|cancel|delete|settings|save|study|next|previous|search|import|export|please|failed|success|click|button|submit|confirm|undo|retry|yes)\b/i;

describe("interface text (NFR-13)", () => {
  const strings: [string, string][] = [];
  collect(T, "T", strings);

  it("has a lot of text to check", () => {
    expect(strings.length).toBeGreaterThan(200);
  });

  it("is written in Portuguese, not in English", () => {
    const offenders = strings.filter(([, text]) => ENGLISH.test(text));
    expect(offenders).toEqual([]);
  });
});
