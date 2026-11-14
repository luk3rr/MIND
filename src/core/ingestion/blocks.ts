/*
 * Filename: blocks.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { parseHTML } from "linkedom";
import type { Segment } from "./types.js";

export type Block =
  { kind: "heading"; level: number; text: string } | { kind: "text"; text: string };

const squeeze = (text: string): string => text.split(/\s+/).filter(Boolean).join(" ");

/** Turns blocks into segments: headings open sections, text accumulates under them. */
export function blocksToSegments(blocks: readonly Block[]): Segment[] {
  const segments: Segment[] = [];
  const stack: { level: number; title: string }[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const text = buffer
      .filter((line) => line.trim())
      .join("\n\n")
      .trim();
    buffer = [];
    if (text) {
      const section = stack.map((entry) => entry.title).join(" > ") || null;
      segments.push({ text, section });
    }
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      flush();
      while (stack.length > 0 && (stack.at(-1) as { level: number }).level >= block.level)
        stack.pop();
      stack.push({ level: block.level, title: block.text });
    } else {
      buffer.push(block.text);
    }
  }
  flush();
  return segments;
}

/** A table row as " | " separated cells, without empty or repeated cells. */
function rowLine(cells: readonly string[]): string | null {
  const unique = cells.filter((cell, index) => cell && !cells.slice(0, index).includes(cell));
  return unique.length > 0 ? unique.join(" | ") : null;
}

const HEADING = /^h([1-6])$/;

/** Reads the block-level content of an HTML fragment in document order. */
export function htmlToBlocks(html: string): Block[] {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks: Block[] = [];

  const walk = (element: Element): void => {
    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();
      const heading = HEADING.exec(tag);
      if (heading) {
        const text = squeeze(child.textContent ?? "");
        if (text) blocks.push({ kind: "heading", level: Number(heading[1]), text });
      } else if (tag === "table") {
        for (const row of Array.from(child.querySelectorAll("tr"))) {
          const line = rowLine(
            Array.from(row.querySelectorAll("th, td")).map((cell) =>
              squeeze(cell.textContent ?? ""),
            ),
          );
          if (line) blocks.push({ kind: "text", text: line });
        }
      } else if (["p", "li", "blockquote", "pre", "dt", "dd", "figcaption"].includes(tag)) {
        const text = squeeze(child.textContent ?? "");
        if (text) blocks.push({ kind: "text", text });
      } else if (["script", "style", "nav", "footer", "aside", "noscript"].includes(tag)) {
        continue;
      } else {
        walk(child);
      }
    }
  };
  walk(document.body);
  return blocks;
}
