/*
 * Filename: rendering.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

const CLOZE = /\{\{c\d+::([\s\S]+?)\}\}/g;
export const GAP = "[…]";

export interface Piece {
  text: string;
  hit: boolean;
}

export interface CardSides {
  front: Piece[];
  back: Piece[];
}

function clozePieces(text: string, reveal: boolean): Piece[] {
  const pieces: Piece[] = [];
  let position = 0;
  for (const match of text.matchAll(CLOZE)) {
    const start = match.index;
    if (start > position) pieces.push({ text: text.slice(position, start), hit: false });
    pieces.push({ text: reveal ? (match[1] as string) : GAP, hit: true });
    position = start + match[0].length;
  }
  if (position < text.length) pieces.push({ text: text.slice(position), hit: false });
  return pieces;
}

/** Front and back pieces for a card of the given type; `hit` marks a cloze gap. */
export function cardSides(subtype: string, front: string, back: string): CardSides {
  if (subtype === "cloze") {
    const extra = back.trim() ? [{ text: `\n\n${back.trim()}`, hit: false }] : [];
    return {
      front: clozePieces(front, false),
      back: [...clozePieces(front, true), ...extra],
    };
  }
  return { front: [{ text: front, hit: false }], back: [{ text: back, hit: false }] };
}
