/*
 * Filename: reader.worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { parentPort } from "node:worker_threads";
import { AppError } from "../contracts/errors.js";
import type { ReaderReply, ReaderRequest } from "./backend.js";
import { PdfReader } from "./pdf-reader.js";

/** Worker entry: keeps PDFs open and answers reading requests one at a time. */
const port = parentPort;
if (!port) throw new Error("reader.worker must run inside a worker thread");

const reader = new PdfReader();

port.on("message", (request: ReaderRequest) => {
  let reply: ReaderReply;
  try {
    const run = reader[request.method] as (...input: unknown[]) => unknown;
    reply = { id: request.id, ok: true, value: run.apply(reader, request.args) };
  } catch (error) {
    reply = {
      id: request.id,
      ok: false,
      ...(error instanceof AppError ? { code: error.code } : {}),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  port.postMessage(reply);
});
