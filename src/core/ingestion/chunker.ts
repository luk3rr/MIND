/*
 * Filename: chunker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Segment } from "./types.js";

export const TARGET_CHARS = 1200;
export const HARD_MAX_CHARS = 1500;
const SENTENCE_END = /(?<=[.!?])\s+/;

export interface ChunkDraft {
  page: number | null;
  section: string | null;
  text: string;
}

/** Splits an oversized paragraph at sentence ends, then at whitespace. */
function splitLong(paragraph: string, hardMax: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const original of paragraph.split(SENTENCE_END)) {
    let sentence = original;
    while (sentence.length > hardMax) {
      let cut = sentence.lastIndexOf(" ", hardMax - 1);
      cut = cut > 0 ? cut : hardMax;
      const head = sentence.slice(0, cut);
      sentence = sentence.slice(cut).trimStart();
      if (current) {
        pieces.push(current);
        current = "";
      }
      pieces.push(head);
    }
    if (current && current.length + 1 + sentence.length > hardMax) {
      pieces.push(current);
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Splits segments into chunks that never cross a page or a section. */
export function chunkSegments(
  segments: readonly Segment[],
  target = TARGET_CHARS,
  hardMax = HARD_MAX_CHARS,
): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];
  for (const segment of segments) {
    const page = segment.page ?? null;
    const section = segment.section ?? null;
    const paragraphs: string[] = [];
    for (const paragraph of segment.text.split("\n\n")) {
      if (paragraph.length > hardMax) paragraphs.push(...splitLong(paragraph, hardMax));
      else paragraphs.push(paragraph);
    }
    let current: string[] = [];
    let size = 0;
    for (const paragraph of paragraphs) {
      if (current.length > 0 && size + paragraph.length > target) {
        drafts.push({ page, section, text: current.join("\n\n") });
        current = [];
        size = 0;
      }
      current.push(paragraph);
      size += paragraph.length + 2;
    }
    if (current.length > 0) drafts.push({ page, section, text: current.join("\n\n") });
  }
  return drafts;
}
