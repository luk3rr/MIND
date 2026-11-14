/*
 * Filename: pdf.worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { parentPort } from "node:worker_threads";
import { AppError } from "../contracts/errors.js";
import type { WorkerMessage } from "../jobs/worker-pool.js";
import { TesseractOcr } from "./ocr.js";
import { extractPdf } from "./pdf.js";

/** Worker entry: reads one PDF off the main thread and reports progress page by page. */
const port = parentPort;
if (!port) throw new Error("pdf.worker must run inside a worker thread");

port.once("message", (message: { payload: { path: string; tessdataDir?: string } }) => {
  const send = (reply: WorkerMessage): void => port.postMessage(reply);
  const { path, tessdataDir } = message.payload;
  const ocr = tessdataDir ? new TesseractOcr(tessdataDir) : undefined;
  extractPdf(path, {
    progress: (progress, text) => send({ type: "progress", progress, message: text }),
    ...(ocr ? { ocr } : {}),
  })
    .then(
      (value) => send({ type: "result", value }),
      (error: unknown) =>
        send({
          type: "error",
          ...(error instanceof AppError ? { code: error.code } : {}),
          message: error instanceof Error ? error.message : String(error),
        }),
    )
    .finally(() => void ocr?.terminate());
});
