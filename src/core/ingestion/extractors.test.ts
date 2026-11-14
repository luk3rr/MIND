/*
 * Filename: extractors.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { tempDir } from "../test/helpers.js";
import { extractPdf } from "./pdf.js";
import { extractText, markdownSegments, reflowParagraphs } from "./text.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures");

interface Golden {
  pdfs: Record<string, { page_count: number; segments: { page: number; text: string }[] }>;
  reflow: { input: string; output: string }[];
  markdown: { input: string; segments: { section: string | null; text: string }[] }[];
  plain_text: { input: string; segments: { section: string | null; text: string }[] };
}

const golden = JSON.parse(readFileSync(join(FIXTURES, "extractors.json"), "utf8")) as Golden;
const pdf = (name: string): string => join(FIXTURES, "pdfs", `${name}.pdf`);
const squeeze = (text: string): string => text.replace(/\s+/g, " ").trim();

describe("reflowParagraphs (golden values from the Python implementation)", () => {
  it.each(golden.reflow.map((item, index) => [index, item] as const))("case %i", (_index, item) => {
    expect(reflowParagraphs(item.input)).toBe(item.output);
  });

  it("joins lines, removes hyphenation and keeps paragraphs", () => {
    const text = reflowParagraphs(
      "O sistema opera com várias\ncamadas inde-\npendentes entre si e cada uma\n" +
        "tem uma função.\nNova ideia começa aqui e segue\npor mais uma linha longa também.\n",
    );
    expect(text).toContain("independentes");
    expect(text.split("\n\n")[1]).toMatch(/^Nova ideia/);
  });

  it("respects blank lines and ignores blank input", () => {
    expect(reflowParagraphs("um\n\ndois\n")).toBe("um\n\ndois");
    expect(reflowParagraphs("   \n\n  ")).toBe("");
  });
});

describe("Markdown and text (golden values)", () => {
  it.each(golden.markdown.map((item, index) => [index, item] as const))(
    "markdown case %i",
    (_i, item) => {
      expect(
        markdownSegments(item.input).map((s) => ({ section: s.section, text: s.text })),
      ).toEqual(item.segments);
    },
  );

  it("reads a Markdown file with a section path and no pages", () => {
    const path = join(tempDir(), "notes.md");
    writeFileSync(
      path,
      "Intro solta.\n\n# Biologia\n\nCélula.\n\n## Núcleo\n\nDNA.\n\n# Química\n\nÁtomo.\n",
    );
    const result = extractText(path);
    expect(result.segments.map((s) => [s.section, s.text])).toEqual([
      [null, "Intro solta."],
      ["Biologia", "Célula."],
      ["Biologia > Núcleo", "DNA."],
      ["Química", "Átomo."],
    ]);
    expect(result.segments.every((s) => !s.page)).toBe(true);
  });

  it("treats plain text as one section and joins wrapped lines (golden)", () => {
    const path = join(tempDir(), "plain.txt");
    writeFileSync(path, golden.plain_text.input);
    const result = extractText(path);
    expect(result.segments.map((s) => ({ section: s.section, text: s.text }))).toEqual(
      golden.plain_text.segments,
    );
  });

  it("fails on non-UTF-8 and on empty text files, and tolerates a BOM", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "bad.txt"), Buffer.from([0xff, 0xfe, 0x00, 0x62, 0x61, 0x64]));
    expect(() => extractText(join(dir, "bad.txt"))).toThrowError(/UTF-8/);
    writeFileSync(join(dir, "empty.md"), "   \n");
    expect(() => extractText(join(dir, "empty.md"))).toThrowError(/não tem texto/);
    writeFileSync(join(dir, "bom.md"), "﻿# Título\n\ncorpo");
    expect(extractText(join(dir, "bom.md")).segments[0]?.section).toBe("Título");
  });

  it("reports progress when reading text", () => {
    const path = join(tempDir(), "a.txt");
    writeFileSync(path, "texto");
    const progress = vi.fn();
    extractText(path, progress);
    expect(progress).toHaveBeenCalledWith(1, "texto lido");
  });
});

describe("extractPdf against the text PyMuPDF reads (golden values)", () => {
  for (const name of ["three-pages", "long", "big-100"]) {
    it(`${name}.pdf has the same pages and the same text`, async () => {
      const expected = golden.pdfs[name];
      const result = await extractPdf(pdf(name));
      expect(result.pageCount).toBe(expected?.page_count);
      expect(result.segments.map((s) => s.page)).toEqual(expected?.segments.map((s) => s.page));
      expect(result.segments.map((s) => squeeze(s.text))).toEqual(
        expected?.segments.map((s) => squeeze(s.text)),
      );
    });
  }

  it("keeps exact paragraphs for the document with hyphenation and accents", async () => {
    const result = await extractPdf(pdf("long"));
    expect(result.segments[0]?.text).toBe(golden.pdfs["long"]?.segments[0]?.text);
  });

  it("reports page progress and checks for cancellation on every page", async () => {
    const seen: [number, string][] = [];
    let calls = 0;
    await extractPdf(pdf("three-pages"), {
      progress: (value, message) => seen.push([value, message]),
      checkCancelled: () => {
        calls += 1;
      },
    });
    expect(seen.at(-1)).toEqual([1, "página 3 de 3"]);
    expect(calls).toBe(3);
  });

  it("rejects corrupted, empty and password-protected PDFs readably", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "broken.pdf"), "%PDF-1.4 this is not a real pdf");
    writeFileSync(join(dir, "empty.pdf"), "");
    await expect(extractPdf(join(dir, "broken.pdf"))).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      message: expect.stringContaining("corrompido"),
    });
    await expect(extractPdf(join(dir, "empty.pdf"))).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
    });
    await expect(extractPdf(pdf("locked"))).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      message: expect.stringContaining("senha"),
    });
  });

  it("points to OCR when a PDF has no text and no engine exists", async () => {
    await expect(extractPdf(pdf("blank"))).rejects.toMatchObject({
      code: "OCR_UNAVAILABLE",
      message: expect.stringContaining("escaneado"),
    });
  });

  it("reads blank pages through an OCR engine and averages the confidence", async () => {
    const recognized = vi.fn(() =>
      Promise.resolve({ text: "texto reconhecido na página", confidence: 80 }),
    );
    const result = await extractPdf(pdf("blank"), {
      ocr: { available: () => true, recognize: recognized },
    });
    expect(recognized).toHaveBeenCalledTimes(2);
    expect(result.ocrConfidence).toBe(80);
    expect(result.segments.map((s) => s.page)).toEqual([1, 2]);
  });

  it("does not send pages with native text to OCR and reports no confidence", async () => {
    const recognize = vi.fn(() => Promise.resolve({ text: "ocr", confidence: 50 }));
    const result = await extractPdf(pdf("long"), { ocr: { available: () => true, recognize } });
    expect(recognize).not.toHaveBeenCalled();
    expect(result.ocrConfidence).toBeNull();
  });

  it("fails when the engine reads nothing and keeps text pages with a warning otherwise", async () => {
    const nothing = {
      available: () => true,
      recognize: () => Promise.resolve({ text: "", confidence: 0 }),
    };
    await expect(extractPdf(pdf("blank"), { ocr: nothing })).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
    });
    const mixed = await extractPdf(pdf("three-pages"));
    expect(mixed.segments.map((s) => s.page)).toEqual([1, 3]);
    expect(mixed.warnings[0]).toContain("2 página(s) sem texto");
  });
});
