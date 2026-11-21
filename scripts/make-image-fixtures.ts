/*
 * Filename: make-image-fixtures.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as mupdf from "mupdf";

/**
 * Writes the small images the image tests use into `src/core/images/fixtures/`. The files are
 * versioned; run `pnpm tsx scripts/make-image-fixtures.ts` only to regenerate them.
 */
const OUT = join(import.meta.dirname, "..", "src", "core", "images", "fixtures");
mkdirSync(OUT, { recursive: true });

function pixmap(width: number, height: number): mupdf.Pixmap {
  const result = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  result.clear(0x9b);
  return result;
}

function write(name: string, bytes: Uint8Array | Buffer): void {
  writeFileSync(join(OUT, name), bytes);
  console.log(`${name}: ${bytes.length} bytes`);
}

const png = pixmap(16, 12);
const pngBytes = Buffer.from(png.asPNG());
write("square.png", pngBytes);
write("photo.jpg", pixmap(16, 12).asJPEG(80));
// Cut in the middle of the image data: the header is fine, the file is not.
write("truncated.png", pngBytes.subarray(0, 40));

// 1x1 GIF with one frame and with two frames.
const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00];
const gifHead = [...Buffer.from("GIF89a"), 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
write("still.gif", Buffer.from([...gifHead, ...frame, 0x3b]));
write("animated.gif", Buffer.from([...gifHead, ...frame, ...frame, 0x3b]));

// Smallest lossy and lossless WebP files (1x1).
write(
  "lossy.webp",
  Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64"),
);
write("lossless.webp", Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64"));

// A PNG that declares 20000 x 20000 pixels (400 megapixels) in a few bytes of data.
const bomb = Buffer.from(pngBytes);
bomb.writeUInt32BE(20_000, 16);
bomb.writeUInt32BE(20_000, 20);
write("huge-pixels.png", bomb);

write(
  "vector.svg",
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>\n'),
);
