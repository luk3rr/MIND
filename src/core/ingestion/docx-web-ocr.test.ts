/*
 * Filename: docx-web-ocr.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { tempDir } from "../test/helpers.js";
import { extractDocx } from "./docx.js";
import { TesseractOcr, ensureTessdata } from "./ocr.js";
import { extractPdf } from "./pdf.js";
import { MAX_BYTES, extractUrl, fetchPage, validateUrl } from "./web.js";
import type { FetchLike } from "./web.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures");
const golden = JSON.parse(readFileSync(join(FIXTURES, "docx-and-scanned.json"), "utf8")) as {
  docx: { section: string | null; text: string }[];
  scanned_terms: string[];
};

describe("extractDocx (golden values from the Python implementation)", () => {
  it("turns headings into sections and tables into lines, like the Python code", async () => {
    const result = await extractDocx(join(FIXTURES, "docx", "sample.docx"));
    expect(result.segments.map((s) => ({ section: s.section, text: s.text }))).toEqual(golden.docx);
  });

  it("reports progress and fails readably on a corrupted file", async () => {
    const progress = vi.fn();
    await extractDocx(join(FIXTURES, "docx", "sample.docx"), progress);
    expect(progress).toHaveBeenCalledWith(1, "documento lido");
    await expect(extractDocx(join(FIXTURES, "docx", "broken.docx"))).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      message: expect.stringContaining("corrompido"),
    });
  });
});

describe("validateUrl", () => {
  it("accepts and trims http and https addresses", () => {
    expect(validateUrl("  https://exemplo.com/a?b=1 ")).toBe("https://exemplo.com/a?b=1");
    expect(validateUrl("http://127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
  });

  it.each([
    "",
    "   ",
    "ftp://x.com",
    "file:///etc/passwd",
    "exemplo.com",
    "http://",
    "https://u:p@x.com/",
    `https://x.com/${"a".repeat(2100)}`,
  ])("refuses %j with a field error", (raw) => {
    let error: unknown;
    try {
      validateUrl(raw);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "VALIDATION_ERROR", fields: [{ field: "url" }] });
  });
});

function responder(responses: (Response | Error)[]) {
  const queue = [...responses];
  const urls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    urls.push(url);
    const next = queue.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetchImpl, urls };
}

const html = (body: string, type = "text/html; charset=utf-8", status = 200): Response =>
  new Response(body, { status, headers: { "content-type": type } });

const ARTICLE = `<!doctype html><html><head><title>Fotossíntese — Wiki</title></head><body>
<nav><a href="/">Início</a></nav>
<article><h1>Fotossíntese</h1>
<p>A fotossíntese é o processo pelo qual as plantas convertem luz em energia química, usando clorofila nos cloroplastos das folhas.</p>
<h2>Etapas</h2>
<p>A fase clara ocorre nos tilacoides e a fase escura no estroma, onde o carbono é fixado em açúcares pelo ciclo de Calvin.</p>
<table><tr><th>Fase</th><th>Local</th></tr><tr><td>Clara</td><td>Tilacoide</td></tr></table>
</article><footer>rodapé que deve sumir</footer></body></html>`;

describe("fetchPage", () => {
  it("downloads a page and reports the final address", async () => {
    const folder = join(tempDir(), "p");
    const { fetchImpl, urls } = responder([html(ARTICLE)]);
    const page = await fetchPage("https://exemplo.com/a", folder, fetchImpl);
    expect(page.finalUrl).toBe("https://exemplo.com/a");
    expect(readFileSync(page.path, "utf8")).toContain("Fotossíntese");
    expect(urls).toEqual(["https://exemplo.com/a"]);
  });

  it("follows relative redirects and validates every hop", async () => {
    const redirect = (to: string): Response =>
      new Response(null, { status: 302, headers: { location: to } });
    const good = responder([redirect("/b"), html(ARTICLE)]);
    expect((await fetchPage("https://x.com/a", tempDir(), good.fetchImpl)).finalUrl).toBe(
      "https://x.com/b",
    );
    const bad = responder([redirect("file:///etc/passwd")]);
    await expect(fetchPage("https://x.com/a", tempDir(), bad.fetchImpl)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("gives up after too many redirects", async () => {
    const loop = (): Response =>
      new Response(null, { status: 301, headers: { location: "/again" } });
    const { fetchImpl } = responder(Array.from({ length: 10 }, loop));
    await expect(fetchPage("https://x.com/a", tempDir(), fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("redireciona vezes demais"),
    });
  });

  it.each([
    [html("x", "text/html", 404), "HTTP 404"],
    [html("x", "application/pdf"), "não é uma página de texto"],
    [html("x".repeat(MAX_BYTES + 1)), "limite de 5 MB"],
  ])("reports bad responses as extraction failures", async (response, text) => {
    const { fetchImpl } = responder([response]);
    await expect(fetchPage("https://x.com/a", tempDir(), fetchImpl)).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      message: expect.stringContaining(text),
    });
  });

  it("reports network problems and timeouts without a traceback", async () => {
    const network = responder([new TypeError("fetch failed")]);
    await expect(fetchPage("https://x.com/a", tempDir(), network.fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("falha de rede"),
    });
    const timeout = new DOMException("slow", "TimeoutError");
    const slow = responder([timeout as unknown as Error]);
    await expect(fetchPage("https://x.com/a", tempDir(), slow.fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("demorou demais"),
    });
  });
});

describe("extractUrl", () => {
  function save(content: string): string {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "page.html");
    writeFileSync(path, content);
    return path;
  }

  it("extracts the main text split by headings, with the page title", () => {
    const result = extractUrl(save(ARTICLE));
    const text = result.segments.map((s) => `${s.section ?? ""}::${s.text}`).join("\n");
    // Readability drops the heading that repeats the page title, so the first block has no section.
    expect(text).toContain("::A fotossíntese é o processo");
    expect(text).toContain("Etapas::A fase clara ocorre");
    expect(text).toContain("Fase | Local");
    expect(text).not.toContain("rodapé");
    expect(result.title).toContain("Fotossíntese");
  });

  it("explains when a page has no readable text", () => {
    expect(() => extractUrl(save("<html><body><script>app()</script></body></html>"))).toThrowError(
      /JavaScript/,
    );
  });
});

describe("OCR with the bundled Tesseract", () => {
  it("copies the language data once and reuses it", () => {
    const dir = join(tempDir(), "tessdata");
    ensureTessdata(dir);
    ensureTessdata(dir);
    expect(readFileSync(join(dir, "por.traineddata.gz")).length).toBeGreaterThan(1_000_000);
    expect(readFileSync(join(dir, "eng.traineddata.gz")).length).toBeGreaterThan(1_000_000);
  });

  it("reads an image-only PDF and reports the mean confidence", async () => {
    const ocr = new TesseractOcr(join(tempDir(), "tessdata"));
    try {
      const result = await extractPdf(join(FIXTURES, "pdfs", "scanned.pdf"), { ocr });
      const text = result.segments
        .map((s) => s.text)
        .join(" ")
        .toLowerCase();
      for (const term of golden.scanned_terms) expect(text).toContain(term);
      expect(result.pageCount).toBe(1);
      expect(result.ocrConfidence).toBeGreaterThan(60);
    } finally {
      await ocr.terminate();
    }
  }, 60_000);

  it("is reported as unavailable after the engine fails to start", async () => {
    const blocker = join(tempDir(), "file");
    writeFileSync(blocker, "x");
    // A directory below a regular file can never be created.
    const ocr = new TesseractOcr(join(blocker, "tessdata"));
    expect(ocr.available()).toBe(true);
    await expect(ocr.recognize(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(ocr.available()).toBe(false);
    await ocr.terminate();
  });
});
