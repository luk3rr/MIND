/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { and, asc, count, desc, eq, lt } from "drizzle-orm";
import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join, relative } from "node:path";
import { AppError } from "../contracts/errors.js";
import { chunk, material } from "../db/workspace-schema.js";
import { JobCancelled } from "../jobs/queue.js";
import { getJob } from "../jobs/store.js";
import type { JobContext, JobQueue } from "../jobs/queue.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { chunkSegments } from "./chunker.js";
import type { ExtractFn, ExtractionResult, Kind } from "./types.js";
import { extractPdf } from "./pdf.js";
import { extractText } from "./text.js";
import { extractDocx } from "./docx.js";
import { TesseractOcr } from "./ocr.js";
import { PAGE_NAME, extractUrl, fetchPage, validateUrl } from "./web.js";
import type { FetchLike } from "./web.js";

export const MAX_FILENAME = 120;
const UNSAFE = /[^\p{L}\p{N}_.\- ]+/gu;
const INSERT_BATCH = 500;

export interface MaterialInfo {
  id: number;
  title: string;
  kind: string;
  filename: string;
  status: string;
  pageCount: number | null;
  charCount: number | null;
  ocrConfidence: number | null;
  jobId: number | null;
  errorCode: string | null;
  errorDetail: string | null;
  createdAt: string;
  sourceUrl: string | null;
}

export interface MaterialView extends MaterialInfo {
  progress: number | null;
  chunkCount: number;
}

export interface ChunkInfo {
  id: number;
  materialId: number;
  ordinal: number;
  page: number | null;
  section: string | null;
  text: string;
}

/** Extension to kind. */
const KINDS: Record<string, Kind> = {
  ".pdf": "pdf",
  ".md": "text",
  ".markdown": "text",
  ".txt": "text",
  ".docx": "docx",
};

export const SUPPORTED_MESSAGE = "Use PDF, Word (.docx), Markdown ou texto.";

/** Keeps only a safe base name; never trusts a path sent by the client. */
export function sanitizeFilename(raw: string): string {
  const name = basename(raw.replaceAll("\\", "/"));
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = dot > 0 ? name.slice(dot + 1) : "";
  const cleaned = stem
    .replace(UNSAFE, "_")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, MAX_FILENAME);
  const base = cleaned || "material";
  return suffix ? `${base}.${suffix.toLowerCase()}` : base;
}

/** The default extraction: runs in the calling thread. The app swaps in a worker-based one. */
export const extractInProcess: ExtractFn = async (kind, path, hooks) => {
  if (kind === "pdf") {
    const ocr = hooks.tessdataDir ? new TesseractOcr(hooks.tessdataDir) : undefined;
    try {
      return await extractPdf(path, {
        ...(hooks.progress ? { progress: hooks.progress } : {}),
        ...(ocr ? { ocr } : {}),
        checkCancelled: () => {
          if (hooks.signal?.aborted) throw new JobCancelled();
        },
      });
    } finally {
      await ocr?.terminate();
    }
  }
  if (kind === "text") return extractText(path, hooks.progress);
  if (kind === "docx") return extractDocx(path, hooks.progress);
  if (kind === "url") return extractUrl(path, hooks.progress);
  throw new AppError("UNSUPPORTED_FILE", "Formato não suportado.");
};

function toInfo(row: typeof material.$inferSelect): MaterialInfo {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    filename: row.filename,
    status: row.status,
    pageCount: row.pageCount,
    charCount: row.charCount,
    ocrConfidence: row.ocrConfidence,
    jobId: row.jobId,
    errorCode: row.errorCode,
    errorDetail: row.errorDetail,
    createdAt: row.createdAt,
    sourceUrl: row.sourceUrl,
  };
}

export interface MaterialServiceOptions {
  maxUploadBytes: number;
  extract?: ExtractFn;
  /** Where the OCR language data is cached; OCR is off when absent. */
  tessdataDir?: string;
  /** How pages are downloaded; tests replace it. */
  fetch?: FetchLike;
}

/** Imports, indexes and lists the materials of one workspace. */
export class MaterialService {
  private readonly extract: ExtractFn;

  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly queue: JobQueue,
    private readonly options: MaterialServiceOptions,
  ) {
    this.extract = options.extract ?? extractInProcess;
  }

  private get db() {
    return this.workspace.connection.db;
  }

  private kindFor(filename: string): Kind {
    const suffix = extname(filename).toLowerCase();
    const kind = KINDS[suffix];
    if (!kind) {
      throw new AppError(
        "UNSUPPORTED_FILE",
        `Formato '${suffix || "sem extensão"}' não suportado. ${SUPPORTED_MESSAGE}`,
      );
    }
    return kind;
  }

  /** Queues the download and indexing of a web page. */
  importUrl(rawUrl: string): MaterialInfo {
    const url = validateUrl(rawUrl);
    const parts = new URL(url);
    const folder = join(this.workspace.filesDir, randomUUID().replaceAll("-", ""));
    mkdirSync(folder, { recursive: true });
    const label = sanitizeFilename(`${parts.host}${parts.pathname}`.replace(/\/+$/, "")).slice(
      0,
      MAX_FILENAME,
    );
    const stored = join(folder, PAGE_NAME);
    const row = this.db
      .insert(material)
      .values({
        title: parts.host,
        kind: "url",
        filename: label || parts.host,
        storedPath: relative(this.workspace.root, stored).split("\\").join("/"),
        status: "queued",
        sourceUrl: url,
      })
      .returning()
      .get();
    const job = this.queue.submit(this.workspace.info.id, this.db, "import", (context) =>
      this.work(row.id, "url", stored, context, { url, folder }),
    );
    this.db.update(material).set({ jobId: job.id }).where(eq(material.id, row.id)).run();
    return this.get(row.id);
  }

  /** Copies a chosen file into the workspace and queues its indexing. */
  importFile(sourcePath: string): MaterialInfo {
    const filename = sanitizeFilename(sourcePath);
    const kind = this.kindFor(filename);
    let size: number;
    try {
      size = statSync(sourcePath).size;
    } catch {
      throw new AppError("UNSUPPORTED_FILE", "Não foi possível ler o arquivo escolhido.");
    }
    if (size > this.options.maxUploadBytes) {
      const limitMb = Math.floor(this.options.maxUploadBytes / (1024 * 1024));
      throw new AppError("UNSUPPORTED_FILE", `O arquivo passa do limite de ${limitMb} MB.`);
    }
    const folder = join(this.workspace.filesDir, randomUUID().replaceAll("-", ""));
    const target = join(folder, filename);
    mkdirSync(folder, { recursive: true });
    try {
      copyFileSync(sourcePath, target);
    } catch (error) {
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
    const row = this.db
      .insert(material)
      .values({
        title: basename(filename, extname(filename)),
        kind,
        filename,
        storedPath: relative(this.workspace.root, target).split("\\").join("/"),
        status: "queued",
      })
      .returning()
      .get();
    return this.queueExtraction(row.id, kind, target);
  }

  private queueExtraction(materialId: number, kind: Kind, path: string): MaterialInfo {
    const job = this.queue.submit(this.workspace.info.id, this.db, "import", (context) =>
      this.work(materialId, kind, path, context),
    );
    this.db.update(material).set({ jobId: job.id }).where(eq(material.id, materialId)).run();
    return this.get(materialId);
  }

  private async work(
    materialId: number,
    kind: Kind,
    path: string,
    context: JobContext,
    page?: { url: string; folder: string },
  ): Promise<void> {
    this.setStatus(materialId, "importing");
    let url: string | undefined;
    try {
      if (page) {
        context.update(0.1, "baixando a página");
        context.checkCancelled();
        const fetched = await fetchPage(page.url, page.folder, this.options.fetch, context.signal);
        url = fetched.finalUrl;
        context.checkCancelled();
      }
      const result = await this.extract(kind, path, {
        progress: (progress, message) => context.update(progress, message),
        signal: context.signal,
        ...(this.options.tessdataDir ? { tessdataDir: this.options.tessdataDir } : {}),
        ...(url ? { url } : {}),
      });
      context.checkCancelled();
      this.storeChunks(materialId, result);
    } catch (error) {
      if (
        error instanceof JobCancelled ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        this.setStatus(materialId, "failed", "CANCELLED", "Importação cancelada.");
        throw new JobCancelled();
      }
      if (error instanceof AppError) {
        this.setStatus(materialId, "failed", error.code, error.message);
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      this.setStatus(materialId, "failed", "EXTRACTION_FAILED", detail);
      throw new AppError("EXTRACTION_FAILED", "Falha inesperada ao ler o arquivo.");
    }
  }

  private setStatus(id: number, status: string, errorCode?: string, errorDetail?: string): void {
    this.db
      .update(material)
      .set({ status, errorCode: errorCode ?? null, errorDetail: errorDetail ?? null })
      .where(eq(material.id, id))
      .run();
  }

  private storeChunks(materialId: number, result: ExtractionResult): void {
    const drafts = chunkSegments(result.segments);
    this.workspace.connection.sqlite.transaction(() => {
      for (let start = 0; start < drafts.length; start += INSERT_BATCH) {
        this.db
          .insert(chunk)
          .values(
            drafts.slice(start, start + INSERT_BATCH).map((draft, offset) => ({
              materialId,
              ordinal: start + offset,
              page: draft.page,
              section: draft.section,
              text: draft.text,
            })),
          )
          .run();
      }
      const current = this.db.select().from(material).where(eq(material.id, materialId)).get();
      this.db
        .update(material)
        .set({
          status: "indexed",
          pageCount: result.pageCount,
          charCount: drafts.reduce((sum, draft) => sum + draft.text.length, 0),
          ocrConfidence: result.ocrConfidence,
          errorCode: null,
          errorDetail: result.warnings.join(" ") || null,
          ...(result.title && current?.kind === "url"
            ? { title: result.title.trim().slice(0, 255) || current.title }
            : {}),
        })
        .where(eq(material.id, materialId))
        .run();
    })();
  }

  /** Materials with the progress of active imports and their chunk counts, newest first. */
  listViews(): MaterialView[] {
    return this.list().map((info) => this.view(info));
  }

  view(info: MaterialInfo): MaterialView {
    const active = ["queued", "importing"].includes(info.status) && info.jobId !== null;
    return {
      ...info,
      progress: active ? getJob(this.db, info.jobId as number).progress : null,
      chunkCount: this.chunkCount(info.id),
    };
  }

  list(): MaterialInfo[] {
    return this.db.select().from(material).orderBy(desc(material.id)).all().map(toInfo);
  }

  get(id: number): MaterialInfo {
    const row = this.db.select().from(material).where(eq(material.id, id)).get();
    if (!row) throw new AppError("MATERIAL_NOT_FOUND", `Não existe material com id ${id}.`);
    return toInfo(row);
  }

  chunks(
    materialId: number,
    options: { page?: number; offset?: number; limit?: number } = {},
  ): ChunkInfo[] {
    this.get(materialId);
    const where =
      options.page === undefined
        ? eq(chunk.materialId, materialId)
        : and(eq(chunk.materialId, materialId), eq(chunk.page, options.page));
    return this.db
      .select()
      .from(chunk)
      .where(where)
      .orderBy(asc(chunk.ordinal))
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0)
      .all();
  }

  /** How many chunks come before `chunkId` in its material (null if it is not there). */
  chunkOffset(materialId: number, chunkId: number): number | null {
    const target = this.db.select().from(chunk).where(eq(chunk.id, chunkId)).get();
    if (!target || target.materialId !== materialId) return null;
    return (
      this.db
        .select({ total: count() })
        .from(chunk)
        .where(and(eq(chunk.materialId, materialId), lt(chunk.ordinal, target.ordinal)))
        .get()?.total ?? 0
    );
  }

  chunkCount(materialId: number): number {
    return (
      this.db.select({ total: count() }).from(chunk).where(eq(chunk.materialId, materialId)).get()
        ?.total ?? 0
    );
  }

  delete(id: number): void {
    const info = this.get(id);
    if (info.jobId !== null && ["queued", "importing"].includes(info.status)) {
      this.queue.cancel(this.workspace.info.id, info.jobId);
    }
    const row = this.db.select().from(material).where(eq(material.id, id)).get();
    this.db.delete(material).where(eq(material.id, id)).run();
    if (row?.storedPath) {
      rmSync(dirname(join(this.workspace.root, row.storedPath)), { recursive: true, force: true });
    }
  }
}
