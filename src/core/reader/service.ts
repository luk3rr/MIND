/*
 * Filename: service.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq } from "drizzle-orm";
import { AppError } from "../contracts/errors.js";
import { meta } from "../db/workspace-schema.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import type { ReaderBackend } from "./backend.js";
import { materialFile } from "./files.js";
import type { Box, PageSize, SearchHit, TextLine } from "./pdf-reader.js";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
const PAGE_CACHE_SIZE = 12;

export interface PageImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** The last rendered pages, so going back and forth does not draw the same page again. */
export class PageCache {
  private readonly entries = new Map<string, PageImage>();

  get(key: string): PageImage | undefined {
    const found = this.entries.get(key);
    if (found) {
      this.entries.delete(key);
      this.entries.set(key, found);
    }
    return found;
  }

  set(key: string, value: PageImage): void {
    this.entries.set(key, value);
    while (this.entries.size > PAGE_CACHE_SIZE) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }
}

const positionKey = (materialId: number): string => `reader.lastPage.${materialId}`;

export interface ReaderInfo {
  title: string;
  pageCount: number;
  pages: PageSize[];
  lastPage: number | null;
}

/** Opens the original PDF of a material: metadata, page images, text boxes and search. */
export class ReaderService {
  constructor(
    private readonly workspace: OpenWorkspace,
    private readonly backend: ReaderBackend,
    private readonly cache: PageCache,
  ) {}

  private pdf(materialId: number): { path: string; title: string } {
    const file = materialFile(this.workspace, materialId);
    if (file.kind !== "pdf") {
      throw new AppError("UNSUPPORTED_FILE", "O leitor abre apenas arquivos PDF.");
    }
    return { path: file.path, title: file.title };
  }

  /** The absolute path of the original file of a material of any kind (for the system viewer). */
  original(materialId: number): { path: string; title: string; kind: string } {
    const file = materialFile(this.workspace, materialId);
    return { path: file.path, title: file.title, kind: file.kind };
  }

  /** Checks that the material is a readable PDF before a reader window is opened for it. */
  assertReadable(materialId: number): void {
    this.pdf(materialId);
  }

  async info(materialId: number): Promise<ReaderInfo> {
    const { path, title } = this.pdf(materialId);
    const { pageCount, pages } = await this.backend.call("info", [path]);
    const saved = Number(this.readMeta(positionKey(materialId)));
    const lastPage = Number.isInteger(saved) && saved >= 1 && saved <= pageCount ? saved : null;
    return { title, pageCount, pages, lastPage };
  }

  /** Remembers the page the person was reading so the next visit resumes there. */
  savePosition(materialId: number, page: number): void {
    this.pdf(materialId);
    this.workspace.connection.db
      .insert(meta)
      .values({ key: positionKey(materialId), value: String(page) })
      .onConflictDoUpdate({ target: meta.key, set: { value: String(page) } })
      .run();
  }

  /** The boxes of a quoted passage on a page, for the highlight of "see in the PDF". */
  async locate(materialId: number, page: number, quote: string): Promise<Box[]> {
    const { path } = this.pdf(materialId);
    return this.backend.call("locate", [path, page, quote]);
  }

  private readMeta(key: string): string | undefined {
    return this.workspace.connection.db
      .select({ value: meta.value })
      .from(meta)
      .where(eq(meta.key, key))
      .get()?.value;
  }

  async page(materialId: number, page: number, scale: number): Promise<PageImage> {
    const { path } = this.pdf(materialId);
    const clamped = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
    const key = `${path}:${page}:${clamped.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const rendered = await this.backend.call("renderPage", [path, page, clamped]);
    const image: PageImage = {
      dataUrl: `data:image/png;base64,${Buffer.from(rendered.png).toString("base64")}`,
      width: rendered.width,
      height: rendered.height,
    };
    this.cache.set(key, image);
    return image;
  }

  async text(
    materialId: number,
    page: number,
  ): Promise<{ width: number; height: number; lines: TextLine[] }> {
    const { path } = this.pdf(materialId);
    return this.backend.call("text", [path, page]);
  }

  async search(
    materialId: number,
    query: string,
  ): Promise<{ hits: SearchHit[]; truncated: boolean }> {
    const { path } = this.pdf(materialId);
    return this.backend.call("search", [path, query]);
  }
}

export type { Box };
