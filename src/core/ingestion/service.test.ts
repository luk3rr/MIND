/*
 * Filename: service.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { JobQueue } from "../jobs/queue.js";
import { getJob } from "../jobs/store.js";
import { tempDir } from "../test/helpers.js";
import { WorkspaceRegistry } from "../workspaces/registry.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { Bm25Retriever } from "../retrieval/retriever.js";
import { MaterialService, sanitizeFilename } from "./service.js";
import type { ExtractFn } from "./types.js";

const PDFS = join(import.meta.dirname, "..", "..", "..", "fixtures", "pdfs");
let registry: WorkspaceRegistry;
let workspace: OpenWorkspace;
let queue: JobQueue;
let source: string;

beforeEach(() => {
  registry = new WorkspaceRegistry(tempDir(), undefined, { warn: () => undefined });
  workspace = registry.open(registry.create("A").id);
  queue = new JobQueue({ progressIntervalMs: 0 });
  source = tempDir();
});

afterEach(async () => {
  await queue.shutdown();
  registry.close();
});

function service(extract?: ExtractFn, maxUploadBytes = 10 * 1024 * 1024): MaterialService {
  return new MaterialService(workspace, queue, { maxUploadBytes, ...(extract ? { extract } : {}) });
}

function write(name: string, content: string): string {
  const path = join(source, name);
  writeFileSync(path, content);
  return path;
}

describe("sanitizeFilename", () => {
  it.each([
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\x\\Notas Finais.MD", "Notas Finais.md"],
    ["a<b>c|d.pdf", "a_b_c_d.pdf"],
    ["...", "material"],
    ["", "material"],
    ["relatório ção.TXT", "relatório ção.txt"],
    [`${"x".repeat(300)}.pdf`, `${"x".repeat(120)}.pdf`],
  ])("%j becomes %j", (raw, expected) => {
    expect(sanitizeFilename(raw)).toBe(expected);
  });
});

describe("MaterialService", () => {
  it("imports Markdown, chunks it and makes it searchable (FR-2, FR-5)", async () => {
    const materials = service();
    const info = materials.importFile(
      write("bio.md", "# Biologia\n\nA fotossíntese ocorre nos cloroplastos."),
    );
    expect(info).toMatchObject({
      kind: "text",
      status: "queued",
      filename: "bio.md",
      title: "bio",
    });
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id)).toMatchObject({
      status: "indexed",
      charCount: 39,
      errorCode: null,
    });
    const hits = new Bm25Retriever(workspace.connection).search("cloroplastos");
    expect(hits[0]).toMatchObject({ materialTitle: "bio", section: "Biologia" });
  });

  it("imports a PDF keeping page numbers and finishing the job at 100%", async () => {
    const materials = service();
    const info = materials.importFile(join(PDFS, "long.pdf"));
    await queue.wait(workspace.info.id, info.jobId as number);
    const done = materials.get(info.id);
    expect(done).toMatchObject({ status: "indexed", kind: "pdf", pageCount: 2 });
    expect(materials.chunks(info.id).map((c) => c.page)).toEqual([1, 2]);
    expect(getJob(workspace.connection.db, info.jobId as number)).toMatchObject({
      state: "done",
      progress: 1,
    });
  });

  it("marks a corrupted PDF and its job as failed", async () => {
    const materials = service();
    const info = materials.importFile(write("broken.pdf", "%PDF-1.4 not a pdf"));
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id)).toMatchObject({
      status: "failed",
      errorCode: "EXTRACTION_FAILED",
    });
    expect(getJob(workspace.connection.db, info.jobId as number).state).toBe("failed");
  });

  it("refuses unsupported formats without leaving files behind", () => {
    const materials = service();
    expect(() => materials.importFile(write("x.exe", "MZ"))).toThrowError(/não suportado/);
    expect(() => materials.importFile(write("noext", "x"))).toThrowError(/sem extensão/);
    expect(existsSync(workspace.filesDir) ? readdirSync(workspace.filesDir) : []).toEqual([]);
    expect(materials.list()).toEqual([]);
  });

  it("refuses oversized files and unreadable paths", () => {
    const materials = service(undefined, 10);
    expect(() => materials.importFile(write("big.txt", "x".repeat(50)))).toThrowError(
      /limite de 0 MB/,
    );
    expect(() => materials.importFile(join(source, "missing.txt"))).toThrowError(AppError);
    expect(existsSync(workspace.filesDir) ? readdirSync(workspace.filesDir) : []).toEqual([]);
  });

  it("keeps the stored copy inside the workspace folder", async () => {
    const materials = service();
    const info = materials.importFile(write("a.txt", "texto"));
    await queue.wait(workspace.info.id, info.jobId as number);
    const row = workspace.connection.sqlite.prepare("SELECT stored_path FROM material").get() as {
      stored_path: string;
    };
    expect(row.stored_path.startsWith("files/")).toBe(true);
    expect(existsSync(join(workspace.root, row.stored_path))).toBe(true);
  });

  it("deletes the row, the chunks, the index entries and the files", async () => {
    const materials = service();
    const info = materials.importFile(write("a.txt", "palavraunica no texto"));
    await queue.wait(workspace.info.id, info.jobId as number);
    materials.delete(info.id);
    expect(materials.list()).toEqual([]);
    expect(new Bm25Retriever(workspace.connection).search("palavraunica")).toEqual([]);
    expect(readdirSync(workspace.filesDir)).toEqual([]);
    expect(() => materials.get(info.id)).toThrowError(AppError);
  });

  it("lists newest first and paginates chunks", async () => {
    const materials = service();
    const long = Array.from(
      { length: 40 },
      (_, i) => `Parágrafo número ${i} ${"y".repeat(900)}`,
    ).join("\n\n");
    const first = materials.importFile(write("one.txt", long));
    const second = materials.importFile(write("two.txt", "curto"));
    await queue.wait(workspace.info.id, first.jobId as number);
    await queue.wait(workspace.info.id, second.jobId as number);
    expect(materials.list().map((m) => m.title)).toEqual(["two", "one"]);
    const total = materials.chunkCount(first.id);
    expect(total).toBeGreaterThan(20);
    expect(materials.chunks(first.id, { limit: 5 }).map((c) => c.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(materials.chunks(first.id, { offset: 5, limit: 2 }).map((c) => c.ordinal)).toEqual([
      5, 6,
    ]);
    const target = materials.chunks(first.id, { offset: 7, limit: 1 })[0];
    expect(materials.chunkOffset(first.id, target?.id as number)).toBe(7);
    expect(materials.chunkOffset(second.id, target?.id as number)).toBeNull();
    expect(materials.chunkOffset(first.id, 999999)).toBeNull();
    expect(materials.chunks(first.id, { page: 3 })).toEqual([]);
  });

  it("cancels the job of a material that is deleted while importing", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const blocking: ExtractFn = async (_kind, _path, hooks) => {
      await gate;
      hooks.signal?.throwIfAborted();
      return {
        segments: [{ text: "x" }],
        pageCount: null,
        ocrConfidence: null,
        warnings: [],
        title: null,
      };
    };
    const materials = service(blocking);
    const info = materials.importFile(write("a.txt", "x"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(materials.get(info.id).status).toBe("importing");
    materials.delete(info.id);
    release();
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(getJob(workspace.connection.db, info.jobId as number).state).toBe("cancelled");
  });

  it("turns unexpected extractor errors into EXTRACTION_FAILED", async () => {
    const materials = service(() => Promise.reject(new Error("boom")));
    const info = materials.importFile(write("a.txt", "x"));
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id)).toMatchObject({
      status: "failed",
      errorCode: "EXTRACTION_FAILED",
      errorDetail: "boom",
    });
    expect(getJob(workspace.connection.db, info.jobId as number)).toMatchObject({
      state: "failed",
      errorCode: "EXTRACTION_FAILED",
    });
  });

  it("keeps the warnings of an indexed PDF as a note", async () => {
    const materials = service();
    const info = materials.importFile(join(PDFS, "three-pages.pdf"));
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id).errorDetail).toContain("sem texto");
  });

  it("reports a scanned PDF without OCR with its stable code", async () => {
    const materials = service();
    const info = materials.importFile(join(PDFS, "blank.pdf"));
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id)).toMatchObject({
      status: "failed",
      errorCode: "OCR_UNAVAILABLE",
    });
  });

  it("imports a Word document with its sections (FR-4)", async () => {
    const materials = service();
    const info = materials.importFile(
      join(import.meta.dirname, "..", "..", "..", "fixtures", "docx", "sample.docx"),
    );
    expect(info.kind).toBe("docx");
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id).status).toBe("indexed");
    expect(materials.chunks(info.id).map((c) => c.section)).toEqual([
      "Biologia",
      "Biologia > Núcleo",
      "Química",
    ]);
  });

  it("imports a scanned PDF through OCR and keeps its confidence (FR-3)", async () => {
    const tessdataDir = join(tempDir(), "tessdata");
    const materials = new MaterialService(workspace, queue, { maxUploadBytes: 1e8, tessdataDir });
    const info = materials.importFile(join(PDFS, "scanned.pdf"));
    await queue.wait(workspace.info.id, info.jobId as number);
    const done = materials.get(info.id);
    expect(done.status).toBe("indexed");
    expect(done.ocrConfidence).toBeGreaterThan(60);
  }, 60_000);
});

describe("MaterialService web pages", () => {
  const page = `<html><head><title>Aula de Biologia</title></head><body><article><h1>Célula</h1>
    <p>A célula é a unidade básica da vida e contém organelas como mitocôndrias e cloroplastos em células vegetais.</p>
    <p>O núcleo guarda o material genético e controla as atividades da célula durante todo o seu ciclo de vida.</p></article></body></html>`;

  function pages(response: Response | Error) {
    return (): Promise<Response> =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }

  it("downloads, indexes and remembers a URL (FR-4)", async () => {
    const fetchImpl = pages(new Response(page, { headers: { "content-type": "text/html" } }));
    const materials = new MaterialService(workspace, queue, {
      maxUploadBytes: 1e8,
      fetch: fetchImpl,
    });
    const info = materials.importUrl(" https://exemplo.com/aula/biologia ");
    expect(info).toMatchObject({
      kind: "url",
      status: "queued",
      sourceUrl: "https://exemplo.com/aula/biologia",
    });
    await queue.wait(workspace.info.id, info.jobId as number);
    const done = materials.get(info.id);
    expect(done).toMatchObject({ status: "indexed", title: "Aula de Biologia" });
    expect(new Bm25Retriever(workspace.connection).search("mitocôndrias")[0]?.section).toBe(
      "Célula",
    );
  });

  it("marks a failed download on the material and on the job", async () => {
    const fetchImpl = pages(new TypeError("offline"));
    const materials = new MaterialService(workspace, queue, {
      maxUploadBytes: 1e8,
      fetch: fetchImpl,
    });
    const info = materials.importUrl("https://exemplo.com/x");
    await queue.wait(workspace.info.id, info.jobId as number);
    expect(materials.get(info.id)).toMatchObject({
      status: "failed",
      errorCode: "EXTRACTION_FAILED",
    });
    expect(getJob(workspace.connection.db, info.jobId as number).state).toBe("failed");
  });

  it("never creates a material for an invalid address", () => {
    const materials = service();
    expect(() => materials.importUrl("ftp://x.com")).toThrowError(AppError);
    expect(() => materials.importUrl("")).toThrowError(AppError);
    expect(materials.list()).toEqual([]);
    expect(existsSync(workspace.filesDir) ? readdirSync(workspace.filesDir) : []).toEqual([]);
  });
});
