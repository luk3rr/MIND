/*
 * Filename: service.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { and, eq, ne } from "drizzle-orm";
import writeXlsxFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import type { ItemDraft } from "../authoring/validate.js";
import { ItemAuthoringService } from "../authoring/service.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { AppError } from "../contracts/errors.js";
import { item, topic } from "../db/workspace-schema.js";
import { logger } from "../logging.js";
import { normalize } from "../verification/source-checker.js";
import type { WorkspaceRegistry } from "../workspaces/registry.js";
import { readTable } from "./read.js";
import { columnsOf, examplesOf, instructionsOf, templateCsv } from "./templates.js";
import type { ImportKind, TemplateFormat } from "./templates.js";
import { mapColumns, parseRow } from "./validate.js";

const log = logger("import");

/** How long a preview waits for its confirmation, and how many wait at the same time. */
export const PREVIEW_MINUTES = 15;
const MAX_PREVIEWS = 5;
/** Rows of a preview that go to the window in one answer. */
export const PREVIEW_PAGE = 500;
/** The longest text of a row shown in the preview. */
const SHOWN_CHARS = 200;

export type RowStatus = "valid" | "error" | "duplicate";

/** One row of a preview as the window sees it. */
export interface PreviewRow {
  line: number;
  status: RowStatus;
  text: string;
  topic: string | null;
  topicIsNew: boolean;
  /** Why the row is an error or a duplicate; null for a valid row. */
  problem: string | null;
}

export interface PreviewTotals {
  rows: number;
  valid: number;
  errors: number;
  duplicates: number;
}

/** What a confirmed import did. */
export interface ImportOutcome {
  imported: number;
  /** Duplicates that were left out because the person did not ask for them. */
  skippedDuplicates: number;
  skippedErrors: number;
  topicsCreated: number;
}

export interface ImportPreview {
  token: string;
  fileName: string;
  totals: PreviewTotals;
  newTopics: string[];
  /** The first rows (up to `PREVIEW_PAGE`); the others are asked for with `rows`. */
  rows: PreviewRow[];
  truncated: boolean;
}

interface StoredRow extends PreviewRow {
  draft: ItemDraft | null;
}

interface Stored {
  workspaceId: number;
  kind: ImportKind;
  fileName: string;
  expiresAt: number;
  rows: StoredRow[];
}

/** The file name offered by the "save as" dialog for a template. */
export function templateName(kind: ImportKind, format: TemplateFormat): string {
  return `modelo-${kind === "card" ? "cartoes" : "questoes"}.${format}`;
}

/** The template as an `.xlsx` file: the sheet to fill in and a second one with the instructions. */
export async function templateXlsx(kind: ImportKind): Promise<Buffer> {
  const header = columnsOf(kind).map((value) => ({ value, fontWeight: "bold" as const }));
  const data: SheetData = [header, ...examplesOf(kind)];
  const [title, ...lines] = instructionsOf(kind);
  const instructions: SheetData = [
    [{ value: title ?? "", fontWeight: "bold" as const }],
    ...lines.map((line) => [line]),
  ];
  return writeXlsxFile([
    {
      sheet: kind === "card" ? "Cartões" : "Questões",
      data,
      columns: columnsOf(kind).map((name) => ({ width: Math.max(name.length + 4, 18) })),
    },
    { sheet: "Instruções", data: instructions, columns: [{ width: 110 }] },
  ]).toBuffer();
}

/** What the window may see of a stored row: everything but the parsed item. */
const visible = (row: StoredRow): PreviewRow => ({
  line: row.line,
  status: row.status,
  text: row.text,
  topic: row.topic,
  topicIsNew: row.topicIsNew,
  problem: row.problem,
});

const shown = (text: string): string =>
  text.length > SHOWN_CHARS ? `${text.slice(0, SHOWN_CHARS)}…` : text;

/**
 * Writes spreadsheets for people to fill in and reads the ones they send back. A file is read and
 * checked into a preview that lives in memory; nothing is stored until the preview is confirmed,
 * and what is confirmed is what the core parsed, never what the window sends back.
 */
export class ImportService {
  private readonly previews = new Map<string, Stored>();

  constructor(
    private readonly registry: WorkspaceRegistry,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Writes the template of a kind to `path` (a place the person chose in the save dialog). */
  async writeTemplate(kind: ImportKind, format: TemplateFormat, path: string): Promise<void> {
    await writeFile(path, format === "csv" ? templateCsv(kind) : await templateXlsx(kind));
  }

  /** Reads and checks the file at `path`; the result waits for a confirmation under a token. */
  async preview(workspaceId: number, kind: ImportKind, path: string): Promise<ImportPreview> {
    const workspace = this.registry.open(workspaceId);
    const { table, format } = await readTable(path);
    const mapped = mapColumns(kind, table.header);
    if ("missing" in mapped) {
      const template = kind === "card" ? "cartões" : "questões";
      throw new AppError(
        "IMPORT_FILE_INVALID",
        `Colunas obrigatórias ausentes: ${mapped.missing.join(", ")}. Baixe o template de ${template}.`,
      );
    }
    const db = workspace.connection.db;
    const seen = new Map<string, number>();
    const existing = new Set(
      db
        .select({ payload: item.payloadJson })
        .from(item)
        .where(and(eq(item.kind, kind), ne(item.status, "discarded")))
        .all()
        .map((row) => {
          const payload = JSON.parse(row.payload) as { front?: string; statement?: string };
          return normalize(String((kind === "card" ? payload.front : payload.statement) ?? ""))
            .text;
        }),
    );
    const known = new Set(
      db
        .select({ name: topic.name })
        .from(topic)
        .all()
        .map((row) => row.name.toLowerCase()),
    );
    const newTopics: string[] = [];
    const rows: StoredRow[] = [];
    const totals: PreviewTotals = { rows: 0, valid: 0, errors: 0, duplicates: 0 };
    for (const { line, cells } of table.rows) {
      totals.rows += 1;
      const parsed = parseRow(kind, mapped.columns, cells);
      if (!parsed.ok) {
        const first = mapped.columns.get(kind === "card" ? "frente" : "enunciado");
        totals.errors += 1;
        rows.push({
          line,
          status: "error",
          text: shown((first === undefined ? "" : (cells[first] ?? "")).trim()),
          topic: null,
          topicIsNew: false,
          problem: parsed.problem,
          draft: null,
        });
        continue;
      }
      const { draft, topic: label } = parsed.row;
      const text = draft.kind === "card" ? draft.front : draft.statement;
      const key = normalize(text).text;
      const earlier = seen.get(key);
      const repeated = earlier !== undefined || existing.has(key);
      const isNew = label !== null && !known.has(label.toLowerCase());
      if (!repeated) seen.set(key, line);
      if (isNew && label !== null) {
        known.add(label.toLowerCase());
        newTopics.push(label);
      }
      if (repeated) totals.duplicates += 1;
      else totals.valid += 1;
      rows.push({
        line,
        status: repeated ? "duplicate" : "valid",
        text: shown(text),
        topic: label,
        topicIsNew: isNew,
        problem: repeated
          ? earlier !== undefined
            ? `Repetida: igual à linha ${earlier} do arquivo.`
            : "Já existe um item igual neste workspace."
          : null,
        draft,
      });
    }
    this.forget();
    const token = randomUUID();
    this.previews.set(token, {
      workspaceId,
      kind,
      fileName: basename(path),
      expiresAt: this.clock.now().getTime() + PREVIEW_MINUTES * 60_000,
      rows,
    });
    log.info("import previewed", { kind, format, ...totals, newTopics: newTopics.length });
    return {
      token,
      fileName: basename(path),
      totals,
      newTopics,
      rows: rows.slice(0, PREVIEW_PAGE).map(visible),
      truncated: rows.length > PREVIEW_PAGE,
    };
  }

  /**
   * Stores the rows of a preview that are valid, plus the duplicates the person asked for, all or
   * none. What is stored is what the core parsed when the file was read; the window only says
   * which duplicate lines to include. The preview is used up by a successful import.
   */
  commit(workspaceId: number, token: string, includeDuplicates: readonly number[]): ImportOutcome {
    const stored = this.get(workspaceId, token);
    const wanted = new Set(includeDuplicates);
    const chosen = stored.rows.filter(
      (row) =>
        row.draft !== null &&
        (row.status === "valid" || (row.status === "duplicate" && wanted.has(row.line))),
    );
    const authoring = new ItemAuthoringService(this.registry.open(workspaceId), this.clock);
    const { itemIds, topicsCreated } = authoring.createMany(
      chosen.map((row) => ({ draft: row.draft as ItemDraft, topic: row.topic })),
      "import",
    );
    this.previews.delete(token);
    const outcome: ImportOutcome = {
      imported: itemIds.length,
      skippedDuplicates:
        stored.rows.filter((row) => row.status === "duplicate").length -
        chosen.filter((row) => row.status === "duplicate").length,
      skippedErrors: stored.rows.filter((row) => row.status === "error").length,
      topicsCreated,
    };
    log.info("import committed", { kind: stored.kind, ...outcome });
    return outcome;
  }

  /** A page of the rows of a preview, optionally only the ones in one status. */
  rows(
    workspaceId: number,
    token: string,
    status: RowStatus | "all",
    offset: number,
    limit: number,
  ): { rows: PreviewRow[]; total: number } {
    const stored = this.get(workspaceId, token);
    const matching = stored.rows.filter((row) => status === "all" || row.status === status);
    return {
      rows: matching.slice(offset, offset + limit).map(visible),
      total: matching.length,
    };
  }

  /** Throws the preview away (the person went back or closed the dialog). */
  discard(workspaceId: number, token: string): void {
    const stored = this.previews.get(token);
    if (stored?.workspaceId === workspaceId) this.previews.delete(token);
  }

  private get(workspaceId: number, token: string): Stored {
    this.forget();
    const stored = this.previews.get(token);
    if (!stored || stored.workspaceId !== workspaceId) {
      throw new AppError("IMPORT_EXPIRED", "A prévia expirou. Escolha o arquivo de novo.");
    }
    return stored;
  }

  /** Drops the previews that expired, and the oldest ones beyond the limit. */
  private forget(): void {
    const now = this.clock.now().getTime();
    for (const [token, stored] of this.previews) {
      if (stored.expiresAt <= now) this.previews.delete(token);
    }
    while (this.previews.size >= MAX_PREVIEWS) {
      const oldest = this.previews.keys().next().value;
      if (oldest === undefined) break;
      this.previews.delete(oldest);
    }
  }
}
