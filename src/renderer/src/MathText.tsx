/*
 * Filename: MathText.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import katex from "katex";
import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import { splitMath } from "./math.js";

function render(value: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(value, { displayMode, throwOnError: true });
  } catch {
    return null;
  }
}

/** Text with `$...$` and `$$...$$` formulas rendered; an invalid formula shows its raw text. */
export function MathText({ text }: { text: string }): ReactNode {
  return (
    <span className="math-text">
      {splitMath(text).map((part, index) => {
        if (part.type === "text") return <span key={index}>{part.value}</span>;
        const html = render(part.value, part.type === "display");
        if (html === null) {
          return (
            <span key={index} className="math-error">
              {part.raw}
            </span>
          );
        }
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}
