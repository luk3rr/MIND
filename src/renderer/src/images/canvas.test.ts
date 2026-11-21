/*
 * Filename: canvas.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustToPng } from "./canvas.js";
import { cut, NO_ADJUST, turn } from "./transform.js";

const calls: string[] = [];
let encoded: Blob | null = new Blob([new Uint8Array([1, 2, 3])]);
let decodes = true;
let size = { width: 40, height: 20 };

beforeEach(() => {
  calls.length = 0;
  encoded = new Blob([new Uint8Array([1, 2, 3])]);
  decodes = true;
  size = { width: 40, height: 20 };
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = size.width;
      naturalHeight = size.height;
      set src(_value: string) {
        queueMicrotask(() => (decodes ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  const context = {
    translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
    rotate: (angle: number) => calls.push(`rotate ${Math.round((angle * 180) / Math.PI)}`),
    drawImage: () => calls.push("draw"),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    const blob = encoded;
    if (blob)
      Object.defineProperty(blob, "arrayBuffer", {
        configurable: true,
        value: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      });
    callback(blob);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adjustToPng", () => {
  it("draws the picture untouched when nothing was asked", async () => {
    const bytes = await adjustToPng("data:image/png;base64,AA==", NO_ADJUST);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(calls).toEqual(["translate 0 0", "rotate 0", "draw"]);
  });

  it("turns a quarter to the right and moves the origin so the picture stays in view", async () => {
    await adjustToPng("data:image/png;base64,AA==", turn(NO_ADJUST, "right"));
    // 40 x 20 turned is 20 x 40: the picture is drawn after moving right by the new width.
    expect(calls).toEqual(["translate 0 0", "translate 20 0", "rotate 90", "draw"]);
  });

  it("moves the origin for the other two turns", async () => {
    await adjustToPng("data:image/png;base64,AA==", { ...NO_ADJUST, rotation: 180 });
    expect(calls).toContain("translate 40 20");
    calls.length = 0;
    await adjustToPng("data:image/png;base64,AA==", turn(NO_ADJUST, "left"));
    expect(calls).toContain("translate 0 40");
  });

  it("shifts the origin by the part that is cut from the left and the top", async () => {
    await adjustToPng("data:image/png;base64,AA==", cut(cut(NO_ADJUST, "left", 25), "top", 50));
    expect(calls[0]).toBe("translate -10 -10");
  });

  it("fails when the picture cannot be decoded, has no canvas or cannot be encoded", async () => {
    decodes = false;
    await expect(adjustToPng("data:x", NO_ADJUST)).rejects.toThrow("decoded");
    decodes = true;
    encoded = null;
    await expect(adjustToPng("data:x", NO_ADJUST)).rejects.toThrow("encoded");
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    await expect(adjustToPng("data:x", NO_ADJUST)).rejects.toThrow("canvas");
  });
});
