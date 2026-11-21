/*
 * Filename: probe.test.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, probeImage } from "./probe.js";

const fixture = (name: string): Buffer => readFileSync(join(import.meta.dirname, "fixtures", name));

describe("probeImage", () => {
  it.each([
    ["square.png", "image/png", "png", 16, 12, false],
    ["photo.jpg", "image/jpeg", "jpg", 16, 12, false],
    ["still.gif", "image/gif", "gif", 1, 1, false],
    ["animated.gif", "image/gif", "gif", 1, 1, true],
    ["lossy.webp", "image/webp", "webp", 1, 1, false],
    ["lossless.webp", "image/webp", "webp", 1, 1, false],
  ])("reads %s from its bytes", (name, mime, ext, width, height, animated) => {
    expect(probeImage(fixture(name))).toEqual({
      ok: true,
      info: { format: expect.any(String), mime, ext, width, height, animated },
    });
  });

  it("refuses SVG and unknown content as unsupported", () => {
    expect(probeImage(fixture("vector.svg"))).toEqual({ ok: false, failure: "unsupported" });
    expect(probeImage(Buffer.from("not an image at all"))).toEqual({
      ok: false,
      failure: "unsupported",
    });
    expect(probeImage(Buffer.alloc(0))).toEqual({ ok: false, failure: "unsupported" });
  });

  it("trusts the bytes and not the name: a text file called .png is unsupported", () => {
    expect(probeImage(Buffer.from("<svg></svg>"))).toEqual({ ok: false, failure: "unsupported" });
  });

  it("refuses a file that was cut as corrupt", () => {
    expect(probeImage(fixture("truncated.png"))).toEqual({ ok: false, failure: "corrupt" });
    const jpeg = fixture("photo.jpg");
    expect(probeImage(jpeg.subarray(0, jpeg.length - 20))).toEqual({
      ok: false,
      failure: "corrupt",
    });
    const gif = fixture("still.gif");
    expect(probeImage(gif.subarray(0, gif.length - 1))).toEqual({ ok: false, failure: "corrupt" });
    const webp = fixture("lossy.webp");
    expect(probeImage(webp.subarray(0, webp.length - 4))).toEqual({
      ok: false,
      failure: "corrupt",
    });
  });

  it("refuses a few bytes that declare hundreds of megapixels", () => {
    expect(probeImage(fixture("huge-pixels.png"))).toEqual({ ok: false, failure: "too_large" });
  });

  it("refuses a file above the byte limit without reading it further", () => {
    const big = Buffer.concat([fixture("square.png"), Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect(probeImage(big)).toEqual({ ok: false, failure: "too_large" });
  });
});
