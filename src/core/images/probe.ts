/*
 * Filename: probe.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** The image formats an item may carry. SVG and everything else is refused. */
export type ImageFormat = "png" | "jpeg" | "gif" | "webp";

export interface ImageInfo {
  format: ImageFormat;
  mime: string;
  /** File extension without the dot. */
  ext: "png" | "jpg" | "gif" | "webp";
  width: number;
  height: number;
  /** True for a GIF with more than one frame, an animated WebP or an APNG. */
  animated: boolean;
}

export type ProbeFailure = "unsupported" | "corrupt" | "too_large";

export type ProbeResult = { ok: true; info: ImageInfo } | { ok: false; failure: ProbeFailure };

/** A file above this many bytes is refused. */
export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
/** A file at or above this many bytes is accepted only after the person confirms. */
export const LARGE_IMAGE_BYTES = 20 * 1024 * 1024;
/** An image with more pixels than this is refused (a decompression bomb can be a tiny file). */
export const MAX_IMAGE_PIXELS = 100_000_000;

const MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const EXT: Record<ImageFormat, ImageInfo["ext"]> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
};

interface Dimensions {
  width: number;
  height: number;
  animated: boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function probePng(bytes: Buffer): Dimensions | null {
  if (bytes.length < 33 || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  let animated = false;
  let at = 8;
  let ended = false;
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    if (type === "acTL") animated = true;
    if (at + 12 + length > bytes.length) return null;
    at += 12 + length;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  return ended ? { width, height, animated } : null;
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function probeJpeg(bytes: Buffer): Dimensions | null {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] as number;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    if (SOF_MARKERS.has(marker)) {
      if (at + 9 > bytes.length) return null;
      const height = bytes.readUInt16BE(at + 5);
      const width = bytes.readUInt16BE(at + 7);
      // A file cut before its end marker would fail to decode, so it counts as corrupt.
      if (bytes.lastIndexOf(Buffer.from([0xff, 0xd9])) <= at) return null;
      return { width, height, animated: false };
    }
    if (marker === 0xda) return null;
    at += 2 + length;
  }
  return null;
}

/** Skips the data sub-blocks that end with a zero-length block; returns the next offset or -1. */
function skipSubBlocks(bytes: Buffer, from: number): number {
  let at = from;
  while (at < bytes.length) {
    const size = bytes[at] as number;
    at += 1;
    if (size === 0) return at;
    at += size;
  }
  return -1;
}

function probeGif(bytes: Buffer): Dimensions | null {
  if (bytes.length < 14) return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  const flags = bytes[10] as number;
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  let frames = 0;
  while (at < bytes.length) {
    const block = bytes[at] as number;
    if (block === 0x3b) return frames > 0 ? { width, height, animated: frames > 1 } : null;
    if (block === 0x21) {
      at = skipSubBlocks(bytes, at + 2);
    } else if (block === 0x2c) {
      if (at + 10 > bytes.length) return null;
      const local = bytes[at + 9] as number;
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0) + 1;
      at = skipSubBlocks(bytes, at);
      frames += 1;
    } else return null;
    if (at < 0) return null;
  }
  return null;
}

function probeWebp(bytes: Buffer): Dimensions | null {
  if (bytes.length < 30) return null;
  // The RIFF size must fit in the file; a shorter file was cut.
  if (bytes.readUInt32LE(4) + 8 > bytes.length) return null;
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
      animated: false,
    };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false };
  }
  if (chunk === "VP8X") {
    const flags = bytes[20] as number;
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
      animated: (flags & 0x02) !== 0,
    };
  }
  return null;
}

function formatOf(bytes: Buffer): ImageFormat | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  const head = bytes.toString("latin1", 0, 6);
  if (head === "GIF87a" || head === "GIF89a") return "gif";
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Reads the type and the size of an image from its bytes, never from a name or a declared type.
 * Only the headers are read, so a file with absurd dimensions is refused without being decoded.
 */
export function probeImage(bytes: Buffer): ProbeResult {
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, failure: "too_large" };
  const format = formatOf(bytes);
  if (format === null) return { ok: false, failure: "unsupported" };
  const found = { png: probePng, jpeg: probeJpeg, gif: probeGif, webp: probeWebp }[format](bytes);
  if (found === null || found.width < 1 || found.height < 1) {
    return { ok: false, failure: "corrupt" };
  }
  if (found.width * found.height > MAX_IMAGE_PIXELS) return { ok: false, failure: "too_large" };
  return {
    ok: true,
    info: {
      format,
      mime: MIME[format],
      ext: EXT[format],
      width: found.width,
      height: found.height,
      animated: found.animated,
    },
  };
}
