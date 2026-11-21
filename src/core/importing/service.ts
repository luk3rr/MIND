/*
 * Filename: service.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { and, eq, ne } from "drizzle-orm";
import writeXlsxFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import { draftProblem } from "../authoring/validate.js";
import type { ItemDraft } from "../authoring/validate.js";
import { ItemAuthoringService } from "../authoring/service.js";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { AppError } from "../contracts/errors.js";
import { item, topic } from "../db/workspace-schema.js";
import { probeImage } from "../images/probe.js";
import type { ImageField, ImageRef, ItemImages } from "../images/refs.js";
import { ImageService } from "../images/service.js";
import { logger } from "../logging.js";
import { normalize } from "../verification/source-checker.js";
import type { WorkspaceRegistry } from "../workspaces/registry.js";
import { openBundle } from "./bundle.js";
import type { Bundle } from "./bundle.js";
import { readTable } from "./read.js";
import { columnsOf, examplesOf, instructionsOf, templateCsv } from "./templates.js";
import type { ImportKind, TemplateFormat } from "./templates.js";
import { mapColumns, mapImageColumns, parseRow } from "./validate.js";

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
  /** What was left out of a row that is imported anyway (a picture the zip lacks); else absent. */
  warning?: string;
}

export interface PreviewTotals {
  rows: number;
  valid: number;
  errors: number;
  duplicates: number;
  /** Pictures of the zip that the valid rows use, each counted once (only for a `.zip`). */
  images?: number;
  /** Pictures named in a column that the zip does not have or cannot use (only for a `.zip`). */
  missingImages?: number;
}

/** What a confirmed import did. */
export interface ImportOutcome {
  imported: number;
  /** Duplicates that were left out because the person did not ask for them. */
  skippedDuplicates: number;
  skippedErrors: number;
  topicsCreated: number;
  /** Pictures stored from a `.zip`; absent for a plain spreadsheet. */
  images?: number;
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
  /** The files of the zip that fill each field of the row. */
  files: Partial<Record<ImageField, string[]>>;
}

interface Stored {
  workspaceId: number;
  kind: ImportKind;
  fileName: string;
  expiresAt: number;
  rows: StoredRow[];
  /** The `.zip` the rows came from, read again at the confirmation for its pictures. */
  bundlePath: string | null;
  /** The pictures already stored from the zip, by entry. */
  refs: Map<string, ImageRef>;
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
  ...(row.warning ? { warning: row.warning } : {}),
});

/** The first rule an item breaks with these pictures standing in for the ones of the zip, if any. */
function draftProblemWith(draft: ItemDraft, images: ItemImages): string | null {
  return draftProblem({ ...draft, images } as ItemDraft)?.message ?? null;
}

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

  /**
   * Reads and checks the file at `path` (a `.csv`, an `.xlsx` or a `.zip` with a spreadsheet and
   * its pictures); the result waits for a confirmation under a token.
   */
  async preview(workspaceId: number, kind: ImportKind, path: string): Promise<ImportPreview> {
    const workspace = this.registry.open(workspaceId);
    const isBundle = extname(path).toLowerCase() === ".zip";
    const bundle = isBundle ? await openBundle(path) : null;
    try {
      const { table, format } = bundle ?? (await readTable(path));
      const mapped = mapColumns(kind, table.header);
      if ("missing" in mapped) {
        const template = kind === "card" ? "cartões" : "questões";
        throw new AppError(
          "IMPORT_FILE_INVALID",
          `Colunas obrigatórias ausentes: ${mapped.missing.join(", ")}. Baixe o template de ${template}.`,
        );
      }
      const imageColumns = bundle
        ? mapImageColumns(kind, table.header)
        : new Map<ImageField, number>();
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
      let missingImages = 0;
      const usable = new Set<string>();
      const judged = new Map<string, string | null>();
      for (const { line, cells } of table.rows) {
        totals.rows += 1;
        const parsed = parseRow(kind, mapped.columns, cells, imageColumns);
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
            files: {},
          });
          continue;
        }
        const { draft, topic: label } = parsed.row;
        const text = draft.kind === "card" ? draft.front : draft.statement;
        const files: Partial<Record<ImageField, string[]>> = {};
        const warnings: string[] = [];
        if (bundle) {
          for (const [field, names] of Object.entries(parsed.row.imageNames)) {
            for (const name of names ?? []) {
              const problem = await this.judge(bundle, name, judged);
              if (typeof problem === "string") {
                warnings.push(problem);
                missingImages += 1;
              } else {
                (files[field as ImageField] ??= []).push(problem.entry);
                usable.add(problem.entry);
              }
            }
          }
        }
        // With the pictures that were found, a field that is only a picture must still have one.
        const stood = Object.fromEntries(
          Object.entries(files).map(([field]) => [field, [{ hash: "0".repeat(64) }]]),
        ) as ItemImages;
        const empty = draftProblemWith(draft, stood);
        if (empty !== null) {
          totals.errors += 1;
          rows.push({
            line,
            status: "error",
            text: shown(text),
            topic: null,
            topicIsNew: false,
            problem: [empty, ...warnings].join(" "),
            draft: null,
            files: {},
          });
          continue;
        }
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
          ...(warnings.length > 0
            ? { warning: `${warnings.join(" ")} A linha entra sem elas.` }
            : {}),
          draft,
          files,
        });
      }
      if (bundle) {
        totals.images = usable.size;
        totals.missingImages = missingImages;
      }
      this.forget();
      const token = randomUUID();
      this.previews.set(token, {
        workspaceId,
        kind,
        fileName: basename(path),
        expiresAt: this.clock.now().getTime() + PREVIEW_MINUTES * 60_000,
        rows,
        bundlePath: bundle ? path : null,
        refs: new Map(),
      });
      log.info("import previewed", {
        kind,
        format: bundle ? `zip+${format}` : format,
        ...totals,
        newTopics: newTopics.length,
      });
      return {
        token,
        fileName: basename(path),
        totals,
        newTopics,
        rows: rows.slice(0, PREVIEW_PAGE).map(visible),
        truncated: rows.length > PREVIEW_PAGE,
      };
    } finally {
      bundle?.close();
    }
  }

  /**
   * Whether a picture named in a cell can be used: the entry of the zip, or the reason it cannot.
   * Each entry is read and checked once; its bytes are not kept.
   */
  private async judge(
    bundle: Bundle,
    name: string,
    judged: Map<string, string | null>,
  ): Promise<{ entry: string } | string> {
    const matches = bundle.find(name);
    if (matches.length === 0) return `A imagem “${name}” não está no .zip.`;
    if (matches.length > 1) return `Há mais de uma imagem chamada “${name}” no .zip.`;
    const entry = matches[0] as string;
    if (!judged.has(entry)) {
      let reason: string | null = null;
      try {
        const probed = probeImage(await bundle.read(entry));
        if (!probed.ok) {
          reason = {
            unsupported: `“${name}” não é uma imagem aceita (use PNG, JPEG, WebP ou GIF).`,
            corrupt: `Não foi possível ler a imagem “${name}”.`,
            too_large: `A imagem “${name}” é grande demais.`,
          }[probed.failure];
        }
      } catch (error) {
        reason = error instanceof AppError ? error.message : `Não foi possível ler “${name}”.`;
      }
      judged.set(entry, reason);
    }
    const reason = judged.get(entry);
    return reason ? reason : { entry };
  }

  /**
   * Reads the pictures that the rows to be stored need from the `.zip` of a preview and stores
   * them, so that `commit` (which stays synchronous) only has to point to them. A preview that
   * did not come from a `.zip`, or whose rows name no picture, has nothing to do.
   */
  async prepare(
    workspaceId: number,
    token: string,
    includeDuplicates: readonly number[],
  ): Promise<number> {
    const stored = this.get(workspaceId, token);
    const chosen = this.chosen(stored, includeDuplicates);
    const needed = new Set(chosen.flatMap((row) => Object.values(row.files).flat()));
    if (stored.bundlePath === null || needed.size === 0) return 0;
    const bundle = await openBundle(stored.bundlePath).catch(() => {
      throw new AppError("IMPORT_EXPIRED", "O .zip mudou ou sumiu. Escolha o arquivo de novo.");
    });
    try {
      const images = new ImageService(this.registry.open(workspaceId), this.clock);
      for (const entry of needed) {
        if (stored.refs.has(entry)) continue;
        const result = images.put({ bytes: await bundle.read(entry) }, { confirmLarge: true });
        if (result.stored) stored.refs.set(entry, result.ref);
      }
    } finally {
      bundle.close();
    }
    return stored.refs.size;
  }

  private chosen(stored: Stored, includeDuplicates: readonly number[]): StoredRow[] {
    const wanted = new Set(includeDuplicates);
    return stored.rows.filter(
      (row) =>
        row.draft !== null &&
        (row.status === "valid" || (row.status === "duplicate" && wanted.has(row.line))),
    );
  }

  /**
   * Stores the rows of a preview that are valid, plus the duplicates the person asked for, all or
   * none. What is stored is what the core parsed when the file was read; the window only says
   * which duplicate lines to include. The preview is used up by a successful import. The pictures
   * of a `.zip` are the ones `prepare` stored.
   */
  commit(workspaceId: number, token: string, includeDuplicates: readonly number[]): ImportOutcome {
    const stored = this.get(workspaceId, token);
    const chosen = this.chosen(stored, includeDuplicates);
    const authoring = new ItemAuthoringService(this.registry.open(workspaceId), this.clock);
    const { itemIds, topicsCreated } = authoring.createMany(
      chosen.map((row) => {
        const images: ItemImages = {};
        for (const [field, entries] of Object.entries(row.files)) {
          const list = (entries ?? []).flatMap((entry) => stored.refs.get(entry) ?? []);
          if (list.length > 0) images[field as ImageField] = list;
        }
        const draft = row.draft as ItemDraft;
        return {
          draft: Object.keys(images).length > 0 ? ({ ...draft, images } as ItemDraft) : draft,
          topic: row.topic,
        };
      }),
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
      ...(stored.refs.size > 0 ? { images: stored.refs.size } : {}),
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
