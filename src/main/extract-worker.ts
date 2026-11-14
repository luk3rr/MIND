/*
 * Filename: extract-worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import PdfWorker from "../core/ingestion/pdf.worker?nodeWorker";
import { extractInProcess } from "../core/ingestion/service.js";
import type { ExtractFn } from "../core/ingestion/types.js";
import { runInWorker } from "../core/jobs/worker-pool.js";
import type { ExtractionResult } from "../core/ingestion/types.js";

/** PDFs are read in a worker thread so the window never freezes (NFR-18). */
export const extractWithWorker: ExtractFn = (kind, path, hooks) => {
  if (kind !== "pdf") return extractInProcess(kind, path, hooks);
  return runInWorker<ExtractionResult>(
    () => PdfWorker({}),
    { path, ...(hooks.tessdataDir ? { tessdataDir: hooks.tessdataDir } : {}) },
    {
      ...(hooks.signal ? { signal: hooks.signal } : {}),
      ...(hooks.progress ? { onProgress: hooks.progress } : {}),
    },
  );
};
