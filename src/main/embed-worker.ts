/*
 * Filename: embed-worker.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import EmbedWorker from "../core/retrieval/embed.worker?nodeWorker";

/** Semantic search runs in a worker thread so the window never freezes (NFR-18). */
export const createEmbedWorker = (): ReturnType<typeof EmbedWorker> => EmbedWorker({});
