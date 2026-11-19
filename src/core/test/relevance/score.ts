/*
 * Filename: score.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { ALLOWED, CASES, REQUIRED, TARGETS, caseOfText } from "./cases.js";

/** An item the generation accepted, with the text of the excerpt it quotes. */
export interface AcceptedItem {
  /** The text of the chunk the item cites. */
  sourceText: string;
}

export interface Score {
  accepted: number;
  /** Accepted items made from an excerpt that may not be the source of this kind of item. */
  leaked: number;
  /** The ids of the excerpts the leaked items came from. */
  leakedFrom: string[];
  /** Required excerpts (content) that gave at least one accepted item. */
  covered: number;
  required: number;
  /** covered / required, from 0 to 1. */
  recall: number;
  /** Both goals of `TARGETS` were met. */
  met: boolean;
}

/** Scores the accepted items of one kind against the labelled excerpts. */
export function score(kind: "card" | "question", items: readonly AcceptedItem[]): Score {
  const allowed = new Set<string>(ALLOWED[kind]);
  const leakedFrom: string[] = [];
  const hit = new Set<string>();
  for (const item of items) {
    const entry = caseOfText(item.sourceText);
    if (!entry) {
      leakedFrom.push("unknown");
      continue;
    }
    if (!allowed.has(entry.role)) leakedFrom.push(entry.id);
    else if ((REQUIRED as readonly string[]).includes(entry.role)) hit.add(entry.id);
  }
  const required = CASES.filter((entry) => (REQUIRED as readonly string[]).includes(entry.role));
  const recall = required.length === 0 ? 1 : hit.size / required.length;
  return {
    accepted: items.length,
    leaked: leakedFrom.length,
    leakedFrom,
    covered: hit.size,
    required: required.length,
    recall,
    met: leakedFrom.length <= TARGETS.leaked && recall >= TARGETS.recall,
  };
}

/** One line per kind for the report of the evaluation. */
export function formatScore(kind: "card" | "question", result: Score): string {
  const label = kind === "card" ? "cards    " : "questões ";
  const leaks = result.leaked > 0 ? ` (de: ${[...new Set(result.leakedFrom)].join(", ")})` : "";
  return (
    `${label} aceitos ${result.accepted} · fora de escopo que passaram ${result.leaked}${leaks} · ` +
    `conteúdo coberto ${result.covered}/${result.required} (${Math.round(result.recall * 100)}%) · ` +
    `${result.met ? "meta atingida" : "meta NÃO atingida"}`
  );
}
