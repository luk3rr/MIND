/*
 * Filename: pdf-reader.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { AppError } from "../contracts/errors.js";

/** The largest page image we render, in pixels (a larger zoom is lowered to fit). */
export const MAX_PIXELS = 16_000_000;
/** The search stops collecting after this many occurrences. */
export const MAX_HITS = 500;

export interface PageSize {
  width: number;
  height: number;
}

/** A box in PDF points with the origin at the top left of the page. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLine extends Box {
  text: string;
}

export interface RenderedPage {
  png: Uint8Array;
  width: number;
  height: number;
}

export interface SearchHit {
  page: number;
  rects: Box[];
}

const outOfRange = (): AppError => new AppError("VALIDATION_ERROR", "A página não existe no PDF.");

function boxOf(quads: readonly (readonly number[])[]): Box {
  const xs = quads.flatMap((quad) => [quad[0], quad[2], quad[4], quad[6]]) as number[];
  const ys = quads.flatMap((quad) => [quad[1], quad[3], quad[5], quad[7]]) as number[];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** One character of a page with its quad and the number of its text line. */
export interface Glyph {
  ch: string;
  quad: readonly number[] | null;
  line: number;
}

/** The characters of a page in reading order; the end of a line counts as a space. */
export function glyphsOf(page: mupdf.Page): Glyph[] {
  const glyphs: Glyph[] = [];
  let line = 0;
  const structured = page.toStructuredText("preserve-whitespace");
  try {
    structured.walk({
      beginLine: () => {
        line += 1;
      },
      endLine: () => {
        glyphs.push({ ch: " ", quad: null, line });
      },
      onChar: (ch, _origin, _font, _size, quad) => {
        glyphs.push({ ch, quad, line });
      },
    });
  } finally {
    structured.destroy();
  }
  return glyphs;
}

/** Lower case without accents, so "FUNCAO" finds "função". */
export const fold = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Every occurrence of `query` in the glyphs, ignoring case, accents and the kind of whitespace.
 * Each occurrence is a list of boxes, one per text line it spans.
 */
export function findOccurrences(glyphs: readonly Glyph[], query: string): Box[][] {
  const needle = fold(query).replace(/\s+/g, " ").trim();
  if (!needle) return [];
  const units: string[] = [];
  const source: number[] = [];
  let spaced = true;
  glyphs.forEach((glyph, index) => {
    for (const part of fold(glyph.ch)) {
      if (/\s/.test(part)) {
        if (spaced) continue;
        units.push(" ");
        source.push(index);
        spaced = true;
      } else {
        units.push(part);
        for (let unit = 1; unit < part.length; unit += 1) source.push(index);
        source.push(index);
        spaced = false;
      }
    }
  });
  const haystack = units.join("");
  const found: Box[][] = [];
  for (
    let at = haystack.indexOf(needle);
    at >= 0;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    const from = source[at] ?? 0;
    const to = source[at + needle.length - 1] ?? from;
    const perLine = new Map<number, (readonly number[])[]>();
    for (let index = from; index <= to; index += 1) {
      const glyph = glyphs[index];
      if (!glyph?.quad) continue;
      perLine.set(glyph.line, [...(perLine.get(glyph.line) ?? []), glyph.quad]);
    }
    const rects = [...perLine.values()].map((quads) => boxOf(quads));
    if (rects.length > 0) found.push(rects);
  }
  return found;
}

/** Reads, draws and searches PDFs with mupdf; it keeps a few documents open between calls. */
export class PdfReader {
  private readonly docs = new Map<string, mupdf.Document>();

  constructor(private readonly maxDocs = 3) {}

  private document(path: string): mupdf.Document {
    const cached = this.docs.get(path);
    if (cached) {
      this.docs.delete(path);
      this.docs.set(path, cached);
      return cached;
    }
    let document: mupdf.Document;
    try {
      document = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
    } catch {
      throw new AppError("EXTRACTION_FAILED", "O PDF está corrompido ou não pôde ser aberto.");
    }
    if (document.needsPassword()) {
      throw new AppError("PDF_PROTECTED", "O PDF está protegido por senha.");
    }
    this.docs.set(path, document);
    while (this.docs.size > this.maxDocs) {
      const oldest = this.docs.keys().next().value as string;
      this.docs.get(oldest)?.destroy();
      this.docs.delete(oldest);
    }
    return document;
  }

  private page(path: string, number: number): mupdf.Page {
    const document = this.document(path);
    if (!Number.isInteger(number) || number < 1 || number > document.countPages()) {
      throw outOfRange();
    }
    return document.loadPage(number - 1);
  }

  /** Page count and the size of every page. */
  info(path: string): { pageCount: number; pages: PageSize[] } {
    const document = this.document(path);
    const pageCount = document.countPages();
    const pages: PageSize[] = [];
    for (let index = 0; index < pageCount; index += 1) {
      const [left, top, right, bottom] = document.loadPage(index).getBounds();
      pages.push({ width: right - left, height: bottom - top });
    }
    return { pageCount, pages };
  }

  /** The page as a PNG; the scale is lowered when the image would pass `MAX_PIXELS`. */
  renderPage(path: string, number: number, scale: number): RenderedPage {
    const page = this.page(path, number);
    const [left, top, right, bottom] = page.getBounds();
    const area = (right - left) * (bottom - top);
    const safe = Math.min(scale, Math.sqrt(MAX_PIXELS / Math.max(area, 1)));
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(safe, safe),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      return { png: pixmap.asPNG(), width: pixmap.getWidth(), height: pixmap.getHeight() };
    } finally {
      pixmap.destroy();
    }
  }

  /** The text lines of a page with their boxes, for selection and copy. */
  text(path: string, number: number): { width: number; height: number; lines: TextLine[] } {
    const page = this.page(path, number);
    const [left, top, right, bottom] = page.getBounds();
    const structured = page.toStructuredText("preserve-whitespace");
    const lines: TextLine[] = [];
    try {
      const parsed = JSON.parse(structured.asJSON()) as {
        blocks: {
          type: string;
          lines?: { text: string; bbox: { x: number; y: number; w: number; h: number } }[];
        }[];
      };
      for (const block of parsed.blocks) {
        if (block.type !== "text") continue;
        for (const line of block.lines ?? []) {
          if (!line.text.trim()) continue;
          const { x, y, w, h } = line.bbox;
          lines.push({ text: line.text, x, y, width: w, height: h });
        }
      }
    } finally {
      structured.destroy();
    }
    return { width: right - left, height: bottom - top, lines };
  }

  /** Every occurrence of the text, page by page (ignoring case and accents), up to `MAX_HITS`. */
  search(
    path: string,
    query: string,
    maxHits: number = MAX_HITS,
  ): { hits: SearchHit[]; truncated: boolean } {
    const document = this.document(path);
    const hits: SearchHit[] = [];
    for (let number = 1; number <= document.countPages(); number += 1) {
      const found = findOccurrences(glyphsOf(document.loadPage(number - 1)), query);
      for (const rects of found) {
        if (hits.length >= maxHits) return { hits, truncated: true };
        hits.push({ page: number, rects });
      }
    }
    return { hits, truncated: false };
  }

  /**
   * Where a quoted passage sits on a page: the first occurrence of the whole quote, or else of its
   * first twelve, six or three words. Nothing is returned when none of them is found.
   */
  locate(path: string, number: number, quote: string): Box[] {
    const glyphs = glyphsOf(this.page(path, number));
    const words = quote.split(/\s+/).filter(Boolean);
    for (const attempt of [words.length, 12, 6, 3]) {
      if (attempt > words.length || attempt < 1) continue;
      const found = findOccurrences(glyphs, words.slice(0, attempt).join(" "));
      if (found[0]) return found[0];
    }
    return [];
  }

  close(): void {
    for (const document of this.docs.values()) document.destroy();
    this.docs.clear();
  }
}
