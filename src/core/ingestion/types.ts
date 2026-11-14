/*
 * Filename: types.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/** A run of paragraphs from one page (PDF) or one section (Markdown and text). */
export interface Segment {
  text: string;
  page?: number | null;
  section?: string | null;
}

export interface ExtractionResult {
  segments: Segment[];
  pageCount: number | null;
  ocrConfidence: number | null;
  warnings: string[];
  title: string | null;
}

export type ProgressCallback = (progress: number, message: string) => void;

export type Kind = "pdf" | "text" | "docx" | "url";

export interface ExtractHooks {
  progress?: ProgressCallback;
  signal?: AbortSignal;
  /** Folder where the OCR language data is kept; OCR is skipped when absent. */
  tessdataDir?: string;
  /** The address a downloaded page came from (for the page extractor). */
  url?: string;
}

/** Reads a stored file and returns its text segments. The default runs in-process. */
export type ExtractFn = (
  kind: Kind,
  path: string,
  hooks: ExtractHooks,
) => Promise<ExtractionResult>;

export function emptyResult(segments: Segment[]): ExtractionResult {
  return { segments, pageCount: null, ocrConfidence: null, warnings: [], title: null };
}
