/*
 * Filename: source.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq } from "drizzle-orm";
import { chunk, material } from "../db/workspace-schema.js";
import type { OpenWorkspace } from "../workspaces/registry.js";

/** Where a card or question can be checked in the original PDF. */
export interface PdfSource {
  materialId: number;
  page: number;
  quote: string;
}

/**
 * The PDF page a source citation points to, or null when the source has no page or its material
 * is not a PDF (then there is no original page to open).
 */
export function pdfSourceOf(
  db: OpenWorkspace["connection"]["db"],
  chunkId: number | null,
  page: number | null,
  quote: string,
): PdfSource | null {
  if (chunkId === null || page === null) return null;
  const row = db
    .select({ id: material.id, kind: material.kind })
    .from(chunk)
    .innerJoin(material, eq(material.id, chunk.materialId))
    .where(eq(chunk.id, chunkId))
    .get();
  if (!row || row.kind !== "pdf") return null;
  return { materialId: row.id, page, quote };
}
