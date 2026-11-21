/*
 * Filename: bundle.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { posix } from "node:path";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import { AppError } from "../contracts/errors.js";
import { MAX_IMAGE_BYTES } from "../images/probe.js";
import { MAX_IMPORT_BYTES, tableFromBuffer } from "./read.js";
import type { Table } from "./read.js";

/** What a `.zip` with a spreadsheet and its pictures may hold. */
export const MAX_BUNDLE_ENTRIES = 5000;
export const MAX_BUNDLE_UNPACKED_BYTES = 1024 ** 3;

const invalid = (message: string) => new AppError("IMPORT_FILE_INVALID", message);
const tooBig = (message: string) => new AppError("IMPORT_LIMIT_EXCEEDED", message);

const MESSAGES = {
  notZip: "O arquivo não é um .zip válido.",
  noSheet: "O .zip não tem uma planilha (.csv ou .xlsx).",
  manySheets: "O .zip tem mais de uma planilha. Deixe só uma.",
  tooMany: "O .zip tem arquivos demais.",
  unpacked: "O .zip, depois de aberto, ficaria grande demais. Ele não foi lido.",
  sheetBig: "A planilha do .zip tem mais de 10 MB.",
  imageBig: "Uma imagem do .zip é grande demais.",
  unsafe: "O .zip tem um caminho que não é permitido.",
} as const;

/** The entries of a bundle and a way to read one of them without opening the zip again. */
export interface Bundle {
  fileName: string;
  table: Table;
  format: "csv" | "xlsx";
  /** The picture files by their path inside the zip. */
  entries: ReadonlyMap<string, number>;
  /** The paths whose file name (without folders) is `name`, ignoring case. */
  find(name: string): string[];
  read(path: string): Promise<Buffer>;
  close(): void;
}

const isSheet = (name: string): boolean => /\.(csv|xlsx)$/i.test(name);
/** Files that a file manager adds to a zip and that are not content. */
const isNoise = (name: string): boolean =>
  name.startsWith("__MACOSX/") || posix.basename(name).startsWith(".");

function open(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(invalid(MESSAGES.notZip));
      else resolve(zip);
    });
  });
}

function listEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const found: Entry[] = [];
    zip.on("entry", (entry: Entry) => {
      found.push(entry);
      if (found.length > MAX_BUNDLE_ENTRIES) reject(tooBig(MESSAGES.tooMany));
      else zip.readEntry();
    });
    zip.on("end", () => resolve(found));
    zip.on("error", () => reject(invalid(MESSAGES.notZip)));
    zip.readEntry();
  });
}

function readEntry(zip: ZipFile, entry: Entry, limit: number, tooLarge: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(invalid(MESSAGES.notZip));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        // The real size is counted, so a header that lies about it cannot overflow memory.
        if (size > limit) {
          stream.destroy();
          reject(tooBig(tooLarge));
        } else chunks.push(chunk);
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", () => reject(invalid(MESSAGES.notZip)));
    });
  });
}

/**
 * Opens a `.zip` that holds one spreadsheet and the pictures it names. Paths that climb out of
 * the archive, absolute paths and a total that would unpack to too much are refused before
 * anything is read; nothing is written to disk.
 */
export async function openBundle(path: string): Promise<Bundle> {
  const zip = await open(path);
  try {
    const listed = await listEntries(zip);
    const files = listed.filter((entry) => !entry.fileName.endsWith("/"));
    let total = 0;
    for (const entry of files) {
      const name = entry.fileName;
      const parts = name.split("/");
      if (
        name.startsWith("/") ||
        name.includes("\\") ||
        parts.includes("..") ||
        /^[A-Za-z]:/.test(name)
      ) {
        throw invalid(MESSAGES.unsafe);
      }
      total += entry.uncompressedSize;
    }
    if (total > MAX_BUNDLE_UNPACKED_BYTES) throw tooBig(MESSAGES.unpacked);
    const content = files.filter((entry) => !isNoise(entry.fileName));
    const sheets = content.filter((entry) => isSheet(entry.fileName));
    if (sheets.length === 0) throw invalid(MESSAGES.noSheet);
    if (sheets.length > 1) throw invalid(MESSAGES.manySheets);
    const sheet = sheets[0] as Entry;
    if (sheet.uncompressedSize > MAX_IMPORT_BYTES) throw tooBig(MESSAGES.sheetBig);
    const bytes = await readEntry(zip, sheet, MAX_IMPORT_BYTES, MESSAGES.sheetBig);
    const extension = posix.extname(sheet.fileName).toLowerCase() as ".csv" | ".xlsx";
    const { table, format } = await tableFromBuffer(bytes, extension);
    const byPath = new Map<string, Entry>();
    const sizes = new Map<string, number>();
    for (const entry of content) {
      if (isSheet(entry.fileName)) continue;
      byPath.set(entry.fileName, entry);
      sizes.set(entry.fileName, entry.uncompressedSize);
    }
    return {
      fileName: posix.basename(path.replace(/\\/g, "/")),
      table,
      format,
      entries: sizes,
      find: (name) => {
        const wanted = posix.basename(name).toLowerCase();
        const exact = [...byPath.keys()].filter((key) => key === name);
        if (exact.length > 0) return exact;
        return [...byPath.keys()].filter((key) => posix.basename(key).toLowerCase() === wanted);
      },
      read: (entryPath) => {
        const entry = byPath.get(entryPath);
        if (!entry) return Promise.reject(invalid(MESSAGES.notZip));
        return readEntry(zip, entry, MAX_IMAGE_BYTES, MESSAGES.imageBig);
      },
      close: () => zip.close(),
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}
