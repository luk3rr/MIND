/*
 * Filename: docx.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import mammoth from "mammoth";
import { AppError } from "../contracts/errors.js";
import { blocksToSegments, htmlToBlocks } from "./blocks.js";
import { emptyResult } from "./types.js";
import type { ExtractionResult, ProgressCallback } from "./types.js";

/** Word documents: headings become sections, tables become ` | ` separated lines. */
export async function extractDocx(
  path: string,
  progress?: ProgressCallback,
): Promise<ExtractionResult> {
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ path })).value;
  } catch {
    throw new AppError(
      "EXTRACTION_FAILED",
      "O arquivo Word está corrompido ou não pôde ser aberto.",
    );
  }
  const segments = blocksToSegments(htmlToBlocks(html));
  progress?.(1, "documento lido");
  if (segments.length === 0) {
    throw new AppError("EXTRACTION_FAILED", "O documento Word não tem texto.");
  }
  return emptyResult(segments);
}
