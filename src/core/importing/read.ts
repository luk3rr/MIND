/*
 * Filename: read.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import { AppError } from "../contracts/errors.js";
import { summarizeZip } from "./zip.js";

/** What one import accepts: this many data rows, in a file of this many bytes. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
/** A spreadsheet that unpacks to more than this is refused before it is read. */
const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;

/** The rows of a file as text, the header first; `line` is the position the person sees. */
export interface Table {
  header: string[];
  rows: { line: number; cells: string[] }[];
}

const MESSAGES = {
  extension: "Use um arquivo .csv ou .xlsx.",
  tooBig: "O arquivo tem mais de 10 MB. Divida a planilha em partes menores.",
  tooMany: "A planilha tem mais de 5.000 linhas. Divida o arquivo em partes menores.",
  unpacked: "O arquivo, depois de aberto, ficaria grande demais. Ele não foi lido.",
  notXlsx: "O arquivo não é uma planilha .xlsx válida.",
  unreadable: "Não foi possível ler o arquivo. Confira se ele não está corrompido.",
  empty: "O arquivo está vazio. Baixe o template, preencha e tente de novo.",
} as const;

const fail = (
  code: "UNSUPPORTED_FILE" | "IMPORT_LIMIT_EXCEEDED" | "IMPORT_FILE_INVALID",
  message: string,
) => new AppError(code, message);

const isEmpty = (cells: readonly string[]): boolean => cells.every((cell) => cell.trim() === "");

/** A cell as the text a person would read in it; dates keep only the day. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function toTable(raw: string[][]): Table {
  // Leading empty rows are skipped; the header is the first row with something in it.
  const first = raw.findIndex((cells) => !isEmpty(cells));
  if (first < 0) throw fail("IMPORT_FILE_INVALID", MESSAGES.empty);
  const header = (raw[first] ?? []).map((cell) => cell.trim());
  const rows: Table["rows"] = [];
  for (let index = first + 1; index < raw.length; index += 1) {
    const cells = raw[index] ?? [];
    if (isEmpty(cells)) continue;
    rows.push({ line: index + 1, cells });
    if (rows.length > MAX_IMPORT_ROWS) throw fail("IMPORT_LIMIT_EXCEEDED", MESSAGES.tooMany);
  }
  return { header, rows };
}

/** The BOM that Excel writes at the start of a UTF-8 file. */
const BOM = String.fromCharCode(0xfeff);

function readCsv(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text.startsWith(BOM) ? text.slice(1) : text, {
    delimitersToGuess: [";", ",", "\t"],
    skipEmptyLines: false,
  });
  // A broken quote or a row of the wrong width is reported by the parser; the rest of the file
  // is still read, and the validation of each row says what is wrong with it.
  return parsed.data.map((cells) => cells.map(cellText));
}

async function readXlsx(buffer: Buffer): Promise<string[][]> {
  if (buffer.subarray(0, 2).toString("latin1") !== "PK")
    throw fail("IMPORT_FILE_INVALID", MESSAGES.notXlsx);
  const zip = summarizeZip(buffer);
  if (zip === null) throw fail("IMPORT_FILE_INVALID", MESSAGES.notXlsx);
  if (
    zip.entries > MAX_ZIP_ENTRIES ||
    zip.uncompressed > MAX_UNPACKED_BYTES ||
    zip.largest > MAX_UNPACKED_BYTES / 2
  ) {
    throw fail("IMPORT_LIMIT_EXCEEDED", MESSAGES.unpacked);
  }
  try {
    // Only the values the spreadsheet program stored are read; formulas are never evaluated.
    const sheet = await readSheet(buffer);
    return sheet.map((row) => row.map(cellText));
  } catch {
    throw fail("IMPORT_FILE_INVALID", MESSAGES.unreadable);
  }
}

/**
 * Reads a `.csv` or `.xlsx` file the person chose. The limits (type, size, unpacked size, rows)
 * are checked before the content is trusted, and nothing in the file is ever executed.
 */
export async function readTable(path: string): Promise<{ table: Table; format: "csv" | "xlsx" }> {
  const extension = extname(path).toLowerCase();
  if (extension !== ".csv" && extension !== ".xlsx")
    throw fail("UNSUPPORTED_FILE", MESSAGES.extension);
  const info = await stat(path).catch(() => null);
  if (info === null || !info.isFile()) throw fail("IMPORT_FILE_INVALID", MESSAGES.unreadable);
  if (info.size > MAX_IMPORT_BYTES) throw fail("IMPORT_LIMIT_EXCEEDED", MESSAGES.tooBig);
  return tableFromBuffer(await readFile(path), extension);
}

/** The table of a spreadsheet already in memory (the one inside a `.zip` bundle). */
export async function tableFromBuffer(
  buffer: Buffer,
  extension: ".csv" | ".xlsx",
): Promise<{ table: Table; format: "csv" | "xlsx" }> {
  if (extension === ".csv") {
    return { table: toTable(readCsv(buffer.toString("utf8"))), format: "csv" };
  }
  return { table: toTable(await readXlsx(buffer)), format: "xlsx" };
}
