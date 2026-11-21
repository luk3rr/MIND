/*
 * Filename: reader.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import * as mupdf from "mupdf";
import { afterEach, describe, expect, it } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { material } from "../db/workspace-schema.js";
import { tempDir } from "../test/helpers.js";
import { probeImage } from "../images/probe.js";
import { MAX_HITS, MAX_PIXELS, PdfReader, findOccurrences } from "./pdf-reader.js";
import type { Glyph } from "./pdf-reader.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "fixtures", "pdfs");

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

/** A workspace whose materials point at real files inside its `files` folder. */
function rig() {
  core = createCore({ dataDir: tempDir(), env: {} });
  const workspaceId = core.registry.create("Leitor").id;
  const workspace = core.registry.open(workspaceId);
  let counter = 0;
  const add = (
    filename: string,
    content: string | Buffer | { copy: string },
    kind = "pdf",
  ): number => {
    counter += 1;
    const folder = join(workspace.filesDir, `m${counter}`);
    mkdirSync(folder, { recursive: true });
    const target = join(folder, filename);
    if (typeof content === "object" && !Buffer.isBuffer(content))
      copyFileSync(content.copy, target);
    else writeFileSync(target, content);
    return workspace.connection.db
      .insert(material)
      .values({ title: filename, kind, filename, storedPath: `files/m${counter}/${filename}` })
      .returning({ id: material.id })
      .get().id;
  };
  return { core, workspaceId, workspace, add, reader: core.reader(workspaceId) };
}

describe("reader core (FR-15, FR-17, FR-18, FR-24)", () => {
  it("reports the page count and the size of every page", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    expect(await reader.info(id)).toEqual({
      title: "three.pdf",
      pageCount: 3,
      pages: [
        { width: 595, height: 842 },
        { width: 595, height: 842 },
        { width: 595, height: 842 },
      ],
      lastPage: null,
    });
  });

  it("draws a page as a PNG data URL at the requested scale and caches it", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const image = await reader.page(id, 1, 1.5);
    expect(image.dataUrl.startsWith("data:image/png;base64,iVBOR")).toBe(true);
    expect([image.width, image.height]).toEqual([893, 1263]);
    expect(await reader.page(id, 1, 1.5)).toBe(image);
    const small = await reader.page(id, 2, 0.5);
    expect(small.width).toBe(298);
  });

  it("clamps the scale to the supported range", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    expect((await reader.page(id, 1, 0.01)).width).toBe(149);
    expect((await reader.page(id, 1, 40)).width).toBe(2380);
  });

  it("lowers the scale of a huge page so the image stays under the pixel cap", () => {
    const document = new mupdf.PDFDocument();
    document.insertPage(-1, document.addPage([0, 0, 5000, 5000], 0, document.newDictionary(), ""));
    const path = join(tempDir(), "huge.pdf");
    writeFileSync(path, document.saveToBuffer("").asUint8Array());
    const reader = new PdfReader();
    const page = reader.renderPage(path, 1, 1);
    expect(page.width * page.height).toBeLessThanOrEqual(MAX_PIXELS);
    expect(page.width).toBe(4000);
    reader.close();
  });

  it("returns the text lines with boxes inside the page", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const text = await reader.text(id, 1);
    expect([text.width, text.height]).toEqual([595, 842]);
    const line = text.lines.find((entry) => entry.text.includes("Primeira página"));
    expect(line).toBeDefined();
    expect(line?.width).toBeGreaterThan(50);
    expect(line?.x).toBeGreaterThanOrEqual(0);
    expect((line?.x ?? 0) + (line?.width ?? 0)).toBeLessThanOrEqual(595);
    expect((line?.y ?? 0) + (line?.height ?? 0)).toBeLessThanOrEqual(842);
  });

  it("keeps the text boxes where the page draws the text (spike A19)", () => {
    const reader = new PdfReader();
    const path = join(FIXTURES, "three-pages.pdf");
    const { lines } = reader.text(path, 1);
    const line = lines[0];
    expect(line).toBeDefined();
    const document = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
    const pixmap = document
      .loadPage(0)
      .toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false, true);
    const stride = pixmap.getStride();
    const pixels = pixmap.getPixels();
    const darkIn = (x: number, y: number, width: number, height: number): number => {
      let dark = 0;
      for (let row = Math.floor(y); row < Math.ceil(y + height); row += 1) {
        for (let column = Math.floor(x); column < Math.ceil(x + width); column += 1) {
          if ((pixels[row * stride + column] ?? 255) < 128) dark += 1;
        }
      }
      return dark;
    };
    expect(darkIn(line?.x ?? 0, line?.y ?? 0, line?.width ?? 0, line?.height ?? 0)).toBeGreaterThan(
      20,
    );
    expect(darkIn(50, 400, 300, 40)).toBe(0);
    reader.close();
  });

  it("finds every occurrence, case-insensitively, page by page", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const found = await reader.search(id, "página");
    expect(found.truncated).toBe(false);
    expect(found.hits.map((hit) => hit.page)).toEqual([1, 3]);
    expect(found.hits[0]?.rects[0]?.width).toBeGreaterThan(10);
    expect((await reader.search(id, "PRIMEIRA")).hits.map((hit) => hit.page)).toEqual([1]);
    expect((await reader.search(id, "FUNCAO")).hits.map((hit) => hit.page)).toEqual([1]);
    expect((await reader.search(id, "  terceira   PAGINA ")).hits.map((hit) => hit.page)).toEqual([
      3,
    ]);
    expect((await reader.search(id, "inexistente-xyz")).hits).toEqual([]);
  });

  it("refuses protected, corrupted and out-of-range PDFs with readable errors (FR-24)", async () => {
    const { add, reader } = rig();
    const locked = add("locked.pdf", { copy: join(FIXTURES, "locked.pdf") });
    const broken = add("broken.pdf", "%PDF-1.4 this is not a real pdf");
    const three = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    await expect(reader.info(locked)).rejects.toMatchObject({ code: "PDF_PROTECTED" });
    await expect(reader.info(broken)).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
    await expect(reader.page(three, 9, 1)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(reader.text(three, 0)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses other kinds, unknown materials and files that are gone", async () => {
    const { add, reader, workspace } = rig();
    const note = add("nota.md", "# Nota", "md");
    await expect(reader.info(note)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
    await expect(reader.info(999)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    const gone = add("gone.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    rmSync(join(workspace.filesDir, "m2"), { recursive: true });
    await expect(reader.info(gone)).rejects.toMatchObject({ code: "FILE_MISSING" });
  });

  it("never reads a file outside the workspace folder (NFR-4)", async () => {
    const { add, reader, workspace } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const db = workspace.connection.db;
    const point = (storedPath: string): void => {
      db.update(material).set({ storedPath }).where(eq(material.id, id)).run();
    };
    point("../../outside.pdf");
    await expect(reader.info(id)).rejects.toMatchObject({ code: "FILE_MISSING" });
    point(join(FIXTURES, "three-pages.pdf"));
    await expect(reader.info(id)).rejects.toMatchObject({ code: "FILE_MISSING" });
    symlinkSync(join(FIXTURES, "three-pages.pdf"), join(workspace.filesDir, "link.pdf"));
    point("files/link.pdf");
    await expect(reader.info(id)).rejects.toMatchObject({ code: "FILE_MISSING" });
  });
});

function glyphLine(text: string, line: number, top: number): Glyph[] {
  return [...text].map((ch, index) => {
    const x = index * 6;
    return { ch, quad: [x, top, x + 6, top, x, top + 10, x + 6, top + 10], line };
  });
}

describe("findOccurrences (FR-17)", () => {
  const joined = [
    ...glyphLine("o sistema ope", 1, 0),
    { ch: " ", quad: null, line: 1 },
    ...glyphLine("racional usa", 2, 14),
    { ch: " ", quad: null, line: 2 },
  ];

  it("returns one box per line for an occurrence that breaks across lines", () => {
    const [hit] = findOccurrences(joined, "OPE racional");
    expect(hit).toHaveLength(2);
    expect(hit?.[0]?.y).toBe(0);
    expect(hit?.[1]?.y).toBe(14);
  });

  it("returns every occurrence without overlapping and ignores an empty query", () => {
    expect(findOccurrences(glyphLine("aaaa", 1, 0), "aa")).toHaveLength(2);
    expect(findOccurrences(joined, "   ")).toEqual([]);
    expect(findOccurrences(joined, "nada")).toEqual([]);
  });

  it("stops at the hit limit and reports the truncation", () => {
    const reader = new PdfReader();
    const path = join(FIXTURES, "three-pages.pdf");
    const limited = reader.search(path, "página", 1);
    expect(limited.hits).toHaveLength(1);
    expect(limited.truncated).toBe(true);
    expect(reader.search(path, "página", MAX_HITS).truncated).toBe(false);
    reader.close();
  });
});

describe("quote location and reading position (FR-22, FR-23)", () => {
  it("finds the boxes of a quote, falling back to its first words", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const exact = await reader.locate(id, 1, "Primeira página com função");
    expect(exact).toHaveLength(1);
    expect(exact[0]?.width).toBeGreaterThan(50);
    const loose = await reader.locate(
      id,
      1,
      "primeira PAGINA com funcao e depois um texto que a página não tem de jeito nenhum",
    );
    expect(loose).toHaveLength(1);
    expect(await reader.locate(id, 1, "nada disso existe aqui")).toEqual([]);
    expect(await reader.locate(id, 2, "Primeira página com função")).toEqual([]);
  });

  it("remembers the last page and ignores a saved page that is out of range", async () => {
    const { add, reader, workspace } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    expect((await reader.info(id)).lastPage).toBeNull();
    reader.savePosition(id, 3);
    expect((await reader.info(id)).lastPage).toBe(3);
    reader.savePosition(id, 2);
    expect((await reader.info(id)).lastPage).toBe(2);
    reader.savePosition(id, 40);
    expect((await reader.info(id)).lastPage).toBeNull();
    const md = add("n.md", "# x", "md");
    expect(() => reader.savePosition(md, 1)).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_FILE" }),
    );
    expect(workspace.root).toBeTruthy();
  });
});

describe("cutting a region of a page (FR-12, ADR-4)", () => {
  const dimensions = (bytes: Buffer) => ({
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });

  it("draws only the rectangle, at 200 dpi, from the fractions of the page", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const bytes = await reader.region(id, 1, { x: 0.1, y: 0.1, width: 0.5, height: 0.25 });
    // A4 is 595 x 842 points: half the width at 200 dpi is about 827 pixels.
    const size = dimensions(bytes);
    expect(Math.abs(size.width - (595 * 0.5 * 200) / 72)).toBeLessThanOrEqual(2);
    expect(Math.abs(size.height - (842 * 0.25 * 200) / 72)).toBeLessThanOrEqual(2);
    expect(probeImage(bytes)).toMatchObject({ ok: true, info: { format: "png" } });
  });

  it("draws what is on the page: a rectangle over the text differs from a blank one", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const [box] = await reader.locate(id, 1, "Primeira página com função");
    if (!box) throw new Error("the fixture text was not found");
    const over = {
      x: box.x / 595,
      y: box.y / 842,
      width: Math.max(box.width / 595, 0.05),
      height: Math.max(box.height / 842, 0.02),
    };
    const blank = { ...over, y: 0.9 };
    const text = await reader.region(id, 1, over);
    const empty = await reader.region(id, 1, blank);
    // The same rectangle moved down: equal up to the rounding of the pixel edges.
    expect(Math.abs(dimensions(text).width - dimensions(empty).width)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions(text).height - dimensions(empty).height)).toBeLessThanOrEqual(1);
    expect(text.equals(empty)).toBe(false);
    expect(text.length).toBeGreaterThan(empty.length);
  });

  it("lowers the resolution of a huge region and keeps the picture inside the pixel limit", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const bytes = await reader.region(id, 2, { x: 0, y: 0, width: 1, height: 1 });
    const size = dimensions(bytes);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS);
    expect(size.width).toBeGreaterThan(1000);
  });

  it("clamps a rectangle that leaves the page and refuses a page or file that is not there", async () => {
    const { add, reader } = rig();
    const id = add("three.pdf", { copy: join(FIXTURES, "three-pages.pdf") });
    const bytes = await reader.region(id, 1, { x: 0.9, y: 0.9, width: 1, height: 1 });
    expect(dimensions(bytes).width).toBeGreaterThan(0);
    await expect(reader.region(id, 9, { x: 0, y: 0, width: 1, height: 1 })).rejects.toThrow();
    const md = add("n.md", "# x", "md");
    await expect(reader.region(md, 1, { x: 0, y: 0, width: 1, height: 1 })).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
    });
  });
});
