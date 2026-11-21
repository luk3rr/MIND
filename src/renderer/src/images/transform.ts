/*
 * Filename: transform.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** What the person did to a picture: turns of 90 degrees and the edges cut off, as percentages. */
export interface Adjust {
  /** Clockwise, in degrees. */
  rotation: 0 | 90 | 180 | 270;
  /** Percent of the turned picture removed from each edge; opposite edges never meet. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const NO_ADJUST: Adjust = { rotation: 0, left: 0, top: 0, right: 0, bottom: 0 };

/** The most that can be cut from one edge, so that at least a tenth of a side stays. */
export const MAX_CUT = 90;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isIdentity(adjust: Adjust): boolean {
  return (
    adjust.rotation === 0 &&
    adjust.left === 0 &&
    adjust.top === 0 &&
    adjust.right === 0 &&
    adjust.bottom === 0
  );
}

/** The size of the picture after the turn. */
export function turnedSize(
  width: number,
  height: number,
  rotation: Adjust["rotation"],
): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Turns the picture by 90 degrees; the cuts follow the edges they were on, so they reset. */
export function turn(adjust: Adjust, direction: "left" | "right"): Adjust {
  const next = (adjust.rotation + (direction === "right" ? 90 : 270)) % 360;
  return { ...NO_ADJUST, rotation: next as Adjust["rotation"] };
}

/** Moves one edge, keeping at least one tenth of the picture between opposite edges. */
export function cut(
  adjust: Adjust,
  edge: "left" | "top" | "right" | "bottom",
  percent: number,
): Adjust {
  const opposite = { left: "right", right: "left", top: "bottom", bottom: "top" }[edge] as
    "left" | "top" | "right" | "bottom";
  const limit = Math.min(MAX_CUT, 100 - 10 - adjust[opposite]);
  const value = Math.max(0, Math.min(limit, Number.isFinite(percent) ? percent : 0));
  return { ...adjust, [edge]: value };
}

/** The part of the turned picture that is kept, in whole pixels (never empty). */
export function keptBox(width: number, height: number, adjust: Adjust): Box {
  const turned = turnedSize(width, height, adjust.rotation);
  const x = Math.min(turned.width - 1, Math.round((turned.width * adjust.left) / 100));
  const y = Math.min(turned.height - 1, Math.round((turned.height * adjust.top) / 100));
  const right = Math.round((turned.width * adjust.right) / 100);
  const bottom = Math.round((turned.height * adjust.bottom) / 100);
  return {
    x,
    y,
    width: Math.max(1, turned.width - x - right),
    height: Math.max(1, turned.height - y - bottom),
  };
}
