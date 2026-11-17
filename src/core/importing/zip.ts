/*
 * Filename: zip.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** What a zip archive says about itself, read from its central directory without unpacking. */
export interface ZipSummary {
  entries: number;
  /** Sum of the sizes the entries declare they will have once unpacked. */
  uncompressed: number;
  /** The largest entry once unpacked. */
  largest: number;
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;

/**
 * Reads the central directory of a zip (an `.xlsx` is one) so the sizes can be checked before
 * anything is unpacked. Returns null when the buffer is not a well-formed, non-zip64 archive.
 */
export function summarizeZip(buffer: Buffer): ZipSummary | null {
  let end = -1;
  const lowest = Math.max(0, buffer.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  for (let at = buffer.length - END_RECORD_BYTES; at >= lowest; at -= 1) {
    if (buffer.readUInt32LE(at) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const entries = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const directoryStart = buffer.readUInt32LE(end + 16);
  // The 64-bit variant marks these fields with their maximum value; an `.xlsx` never needs it.
  if (entries === 0xffff || directorySize === 0xffffffff || directoryStart === 0xffffffff) {
    return null;
  }
  if (directoryStart + directorySize > buffer.length) return null;
  const summary: ZipSummary = { entries, uncompressed: 0, largest: 0 };
  let at = directoryStart;
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== DIRECTORY_ENTRY) return null;
    const size = buffer.readUInt32LE(at + 24);
    summary.uncompressed += size;
    summary.largest = Math.max(summary.largest, size);
    const name = buffer.readUInt16LE(at + 28);
    const extra = buffer.readUInt16LE(at + 30);
    const comment = buffer.readUInt16LE(at + 32);
    at += 46 + name + extra + comment;
  }
  return summary;
}
