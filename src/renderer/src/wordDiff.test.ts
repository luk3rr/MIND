/*
 * Filename: wordDiff.test.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { wordDiff } from "./wordDiff.js";

const join = (kinds: readonly string[], text: ReturnType<typeof wordDiff>): string =>
  text
    .filter((s) => kinds.includes(s.kind))
    .map((s) => s.text)
    .join("");

describe("wordDiff", () => {
  it("marks the words that change and keeps the ones that stay", () => {
    const diff = wordDiff("Qual a funcao da mitocondria?", "Qual a função da mitocôndria?");
    expect(join(["same", "del"], diff)).toBe("Qual a funcao da mitocondria?");
    expect(join(["same", "ins"], diff)).toBe("Qual a função da mitocôndria?");
    expect(diff.filter((s) => s.kind === "del").map((s) => s.text)).toEqual([
      "funcao",
      "mitocondria?",
    ]);
    expect(diff.filter((s) => s.kind === "ins").map((s) => s.text)).toEqual([
      "função",
      "mitocôndria?",
    ]);
  });

  it("handles identical, empty and totally different texts", () => {
    expect(wordDiff("igual", "igual")).toEqual([{ kind: "same", text: "igual" }]);
    expect(wordDiff("", "novo texto")).toEqual([{ kind: "ins", text: "novo texto" }]);
    expect(wordDiff("antigo texto", "")).toEqual([{ kind: "del", text: "antigo texto" }]);
    const diff = wordDiff("a b", "c d");
    expect(join(["same", "del"], diff)).toBe("a b");
    expect(join(["same", "ins"], diff)).toBe("c d");
  });

  it("rebuilds both texts exactly for a longer edit with inserted words", () => {
    const before = "A célula produz energia na mitocôndria.";
    const after = "A célula eucarionte produz bastante energia na mitocôndria.";
    const diff = wordDiff(before, after);
    expect(join(["same", "del"], diff)).toBe(before);
    expect(join(["same", "ins"], diff)).toBe(after);
  });
});
