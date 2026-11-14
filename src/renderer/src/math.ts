/*
 * Filename: math.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export type MathPart =
  { type: "text"; value: string } | { type: "inline" | "display"; value: string; raw: string };

// `$$...$$` (display), `$...$` (inline, not touching spaces) and `$x$`; a `$` followed by a
// digit after the closing delimiter is money, not a formula.
const PATTERN = /(\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d))/g;

/** Splits text into plain text, inline formulas and display formulas. */
export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PATTERN)) {
    const raw = match[0];
    const index = match.index;
    if (index > last) parts.push({ type: "text", value: text.slice(last, index) });
    parts.push(
      raw.startsWith("$$")
        ? { type: "display", value: raw.slice(2, -2), raw }
        : { type: "inline", value: raw.slice(1, -1), raw },
    );
    last = index + raw.length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

const CLOZE = /\{\{c\d+::([\s\S]+?)\}\}/g;

/** Shows a cloze gap as `[term]` so reviewers can read the sentence. */
export function clozePlain(text: string): string {
  return text.replace(CLOZE, (_match, term: string) => `[${term}]`);
}
