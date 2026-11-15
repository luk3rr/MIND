/*
 * Filename: reader-worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import ReaderWorker from "../core/reader/reader.worker?nodeWorker";

/** PDF pages are drawn in a worker thread so the window never freezes (NFR-2). */
export const createReaderWorker = (): ReturnType<typeof ReaderWorker> => ReaderWorker({});
