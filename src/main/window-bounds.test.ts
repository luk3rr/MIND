/*
 * Filename: window-bounds.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, MIN_SIZE, resolveBounds } from "./window-bounds.js";

const screenA = { x: 0, y: 0, width: 1920, height: 1080 };
const screenB = { x: 1920, y: 0, width: 1280, height: 1024 };

describe("resolveBounds", () => {
  it("restores saved bounds that are on a connected display", () => {
    const saved = { x: 2000, y: 100, width: 1100, height: 700 };
    expect(resolveBounds(saved, [screenA, screenB])).toEqual({
      size: { width: 1100, height: 700 },
      position: { x: 2000, y: 100 },
    });
  });

  it("falls back to the default size when the display is gone", () => {
    const saved = { x: 2000, y: 100, width: 1100, height: 700 };
    expect(resolveBounds(saved, [screenA])).toEqual({
      size: { ...DEFAULT_SIZE },
      position: null,
    });
  });

  it("uses the default size when nothing was saved", () => {
    expect(resolveBounds(null, [screenA])).toEqual({ size: { ...DEFAULT_SIZE }, position: null });
  });

  it("never goes below the minimum size", () => {
    const saved = { x: 10, y: 10, width: 400, height: 300 };
    expect(resolveBounds(saved, [screenA]).size).toEqual({ ...MIN_SIZE });
  });

  it("treats a window only touching the display edge as off-screen", () => {
    const saved = { x: 1920, y: 0, width: 1000, height: 700 };
    expect(resolveBounds(saved, [screenA]).position).toBeNull();
  });
});
