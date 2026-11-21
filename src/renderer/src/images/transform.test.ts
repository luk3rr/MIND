/*
 * Filename: transform.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { cut, isIdentity, keptBox, NO_ADJUST, turn, turnedSize } from "./transform.js";

describe("turning", () => {
  it("swaps the sides on a quarter turn and goes around after four", () => {
    expect(turnedSize(40, 20, 0)).toEqual({ width: 40, height: 20 });
    expect(turnedSize(40, 20, 90)).toEqual({ width: 20, height: 40 });
    expect(turnedSize(40, 20, 180)).toEqual({ width: 40, height: 20 });
    let adjust = NO_ADJUST;
    for (let count = 0; count < 4; count += 1) adjust = turn(adjust, "right");
    expect(adjust.rotation).toBe(0);
    expect(turn(NO_ADJUST, "left").rotation).toBe(270);
  });

  it("drops the cuts when the picture turns, since they belonged to other edges", () => {
    const cutOnce = cut(NO_ADJUST, "left", 30);
    expect(turn(cutOnce, "right")).toEqual({ ...NO_ADJUST, rotation: 90 });
  });
});

describe("cutting", () => {
  it("keeps the box inside the picture, in whole pixels", () => {
    const adjust = cut(cut(NO_ADJUST, "left", 10), "bottom", 25);
    expect(keptBox(200, 100, adjust)).toEqual({ x: 20, y: 0, width: 180, height: 75 });
  });

  it("never lets opposite edges meet and ignores nonsense", () => {
    const adjust = cut(cut(NO_ADJUST, "left", 80), "right", 80);
    expect(adjust.left).toBe(80);
    expect(adjust.right).toBe(10);
    expect(cut(NO_ADJUST, "top", -5).top).toBe(0);
    expect(cut(NO_ADJUST, "top", Number.NaN).top).toBe(0);
    expect(cut(NO_ADJUST, "top", 400).top).toBe(90);
    const box = keptBox(10, 10, { ...NO_ADJUST, left: 90, right: 10 });
    expect(box.width).toBeGreaterThanOrEqual(1);
  });

  it("measures the cuts on the turned picture", () => {
    const adjust = cut({ ...NO_ADJUST, rotation: 90 }, "top", 50);
    // 40 x 20 turned is 20 x 40: half of the height is cut.
    expect(keptBox(40, 20, adjust)).toEqual({ x: 0, y: 20, width: 20, height: 20 });
  });

  it("knows an untouched picture", () => {
    expect(isIdentity(NO_ADJUST)).toBe(true);
    expect(isIdentity(cut(NO_ADJUST, "left", 1))).toBe(false);
    expect(isIdentity({ ...NO_ADJUST, rotation: 180 })).toBe(false);
  });
});
