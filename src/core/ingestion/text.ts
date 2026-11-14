/*
 * Filename: text.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { AppError } from "../contracts/errors.js";
import { emptyResult } from "./types.js";
import type { ExtractionResult, ProgressCallback, Segment } from "./types.js";

const PARAGRAPH_END = /[.!?:;]$/;
const HYPHEN_BREAK = /([\p{L}\p{N}_])-\n([\p{L}\p{N}_])/gu;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LINE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Rebuilds paragraphs from line-broken text; paragraphs are separated by a blank line. */
export function reflowParagraphs(raw: string): string {
  const joined = raw.replaceAll("\r\n", "\n").replace(HYPHEN_BREAK, "$1$2");
  const blocks = joined.split(/\n\s*\n/).filter((block) => block.trim());
  const paragraphs: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const first = lines[0];
    if (first === undefined) continue;
    const typical = lines.length > 2 ? median(lines.map((line) => line.length)) : 0;
    let current = first;
    for (let index = 1; index < lines.length; index += 1) {
      const previous = lines[index - 1] as string;
      const line = lines[index] as string;
      const shortEnd = typical > 0 && previous.length < 0.7 * typical;
      if (shortEnd && PARAGRAPH_END.test(previous)) {
        paragraphs.push(current);
        current = line;
      } else {
        current = `${current} ${line}`;
      }
    }
    paragraphs.push(current);
  }
  return paragraphs.join("\n\n");
}

function paragraphsOf(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter((block) => block.trim())
    .map((block) => block.split(/\s+/).filter(Boolean).join(" "))
    .join("\n\n");
}

/** Splits Markdown (or plain text) into sections with their heading path. */
export function markdownSegments(content: string, isMarkdown = true): Segment[] {
  const segments: Segment[] = [];
  const stack: { level: number; title: string }[] = [];
  const buffer: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    buffer.length = 0;
    if (text) {
      const section = stack.map((entry) => entry.title).join(" > ") || null;
      segments.push({ text: paragraphsOf(text), section });
    }
  };

  const lines = content.split(LINE_BREAK);
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    if (isMarkdown && line.trimStart().startsWith("```")) inFence = !inFence;
    const heading = inFence || !isMarkdown ? null : HEADING.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] as string).length;
      while (stack.length > 0 && (stack.at(-1) as { level: number }).level >= level) stack.pop();
      stack.push({ level, title: heading[2] as string });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
}

/** Markdown (split by headings) and plain text. */
export function extractText(path: string, progress?: ProgressCallback): ExtractionResult {
  let content: string;
  try {
    const bytes = readFileSync(path);
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch (error) {
    if (error instanceof TypeError) {
      throw new AppError("EXTRACTION_FAILED", "O arquivo não está em UTF-8.");
    }
    throw error;
  }
  const isMarkdown = [".md", ".markdown"].includes(extname(path).toLowerCase());
  const segments = markdownSegments(content, isMarkdown);
  progress?.(1, "texto lido");
  if (segments.length === 0) throw new AppError("EXTRACTION_FAILED", "O arquivo não tem texto.");
  return emptyResult(segments);
}
