/*
 * Filename: web.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "../contracts/errors.js";
import { blocksToSegments, htmlToBlocks } from "./blocks.js";
import type { ExtractionResult, ProgressCallback } from "./types.js";

export const MAX_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_MS = 20_000;
export const MAX_REDIRECTS = 5;
export const MAX_URL_LENGTH = 2048;
export const PAGE_NAME = "page.html";
const ALLOWED_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
const USER_AGENT = "MIND/0.1 (local study tool; user-initiated import)";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function urlProblem(message: string): AppError {
  return new AppError("VALIDATION_ERROR", message, [{ field: "url", message }]);
}

/** Accepts only plain http(s) addresses without embedded credentials. */
export function validateUrl(raw: string): string {
  const url = raw.trim();
  if (!url || url.length > MAX_URL_LENGTH) throw urlProblem("Informe o endereço da página.");
  let parts: URL;
  try {
    parts = new URL(url);
  } catch {
    throw urlProblem("Use um endereço que comece com http:// ou https://.");
  }
  if (!["http:", "https:"].includes(parts.protocol) || !parts.host) {
    throw urlProblem("Use um endereço que comece com http:// ou https://.");
  }
  if (parts.username || parts.password)
    throw urlProblem("O endereço não pode conter usuário e senha.");
  return url;
}

export interface FetchedPage {
  path: string;
  finalUrl: string;
}

function failure(message: string): AppError {
  return new AppError("EXTRACTION_FAILED", message);
}

/** Downloads a page into `folder`, following up to five redirects, within size and time limits. */
export async function fetchPage(
  url: string,
  folder: string,
  fetchImpl: FetchLike = (target, init) => fetch(target, init),
  signal?: AbortSignal,
): Promise<FetchedPage> {
  let current = url;
  try {
    for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
      const response = await fetchImpl(current, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain" },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
          : AbortSignal.timeout(TIMEOUT_MS),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw failure("A página redireciona vezes demais.");
        current = validateUrl(new URL(location, current).toString());
        continue;
      }
      if (response.status >= 400) throw failure(`A página respondeu HTTP ${response.status}.`);
      const kind =
        (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!ALLOWED_TYPES.includes(kind)) {
        throw failure(`O endereço não é uma página de texto (tipo '${kind || "desconhecido"}').`);
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > MAX_BYTES) throw failure("A página passa do limite de 5 MB.");
      mkdirSync(folder, { recursive: true });
      const path = join(folder, PAGE_NAME);
      writeFileSync(path, body);
      return { path, finalUrl: current };
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw failure("A página demorou demais para responder.");
    }
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw failure("Não foi possível baixar a página (falha de rede).");
  }
  throw failure("A página redireciona vezes demais.");
}

/** Extracts the main text of a saved HTML page, split into sections by headings. */
export function extractUrl(path: string, progress?: ProgressCallback): ExtractionResult {
  const html = readFileSync(path, "utf8");
  const { document } = parseHTML(html);
  const pageTitle = document.title.trim() || null;
  let article: { title?: string | null; content?: string | null } | null;
  try {
    article = new Readability(document as unknown as Document).parse();
  } catch {
    article = null;
  }
  if (!article?.content?.trim()) {
    throw failure(
      "Não foi possível extrair o texto principal da página (ela pode depender de JavaScript).",
    );
  }
  progress?.(1, "página lida");
  const segments = blocksToSegments(htmlToBlocks(article.content));
  if (segments.length === 0) throw failure("A página não tem texto.");
  return {
    segments,
    pageCount: null,
    ocrConfidence: null,
    warnings: [],
    title: article.title?.trim() || pageTitle,
  };
}
