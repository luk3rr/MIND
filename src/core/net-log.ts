/*
 * Filename: net-log.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { hostOf, logger, since } from "./logging.js";

const log = logger("net");

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Logs every request the app makes to the internet: method, host, status and time. The path is
 * included only for the provider API; addresses typed by the user (web imports) log the host only,
 * and query strings, headers and bodies are never logged.
 */
export function loggedFetch(inner: Fetcher, options: { withPath: boolean }): Fetcher {
  const wrapped = async (url: string, init: RequestInit): Promise<Response> => {
    const started = performance.now();
    let where = hostOf(url);
    if (options.withPath) {
      try {
        where += new URL(url).pathname;
      } catch {
        // hostOf already reported "invalid".
      }
    }
    try {
      const response = await inner(url, init);
      log.info("http request", {
        method: init.method ?? "GET",
        to: where,
        status: response.status,
        ms: since(started),
      });
      return response;
    } catch (error) {
      log.warn("http request failed", {
        method: init.method ?? "GET",
        to: where,
        error: error instanceof Error ? error.name : "unknown",
        ms: since(started),
      });
      throw error;
    }
  };
  return wrapped;
}
