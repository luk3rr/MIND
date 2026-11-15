/*
 * Filename: source.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, describe, expect, it } from "vitest";
import { chunk, generationRun, item, material } from "../db/workspace-schema.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";
import { pdfSourceOf } from "./source.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

describe("pdfSourceOf (FR-22)", () => {
  it("points to the PDF page only when the material is a PDF and the source has a page", () => {
    rig = generationRig();
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const pdfId = db
      .insert(material)
      .values({ title: "p", kind: "pdf", filename: "p.pdf", storedPath: "x" })
      .returning({ id: material.id })
      .get().id;
    const pdfChunk = db
      .insert(chunk)
      .values({ materialId: pdfId, ordinal: 0, page: 5, text: "t" })
      .returning({ id: chunk.id })
      .get().id;
    const textChunk = rig.chunkIds[0] ?? 0;
    expect(pdfSourceOf(db, pdfChunk, 5, "q")).toEqual({ materialId: pdfId, page: 5, quote: "q" });
    expect(pdfSourceOf(db, pdfChunk, null, "q")).toBeNull();
    expect(pdfSourceOf(db, null, 5, "q")).toBeNull();
    expect(pdfSourceOf(db, 9999, 5, "q")).toBeNull();
    expect(pdfSourceOf(db, textChunk, 1, "q")).toBeNull();
  });

  it("is part of the items the review service and the error notebook return", () => {
    rig = generationRig();
    const { db } = rig.core.registry.open(rig.workspaceId).connection;
    const pdfId = db
      .insert(material)
      .values({ title: "p", kind: "pdf", filename: "p.pdf", storedPath: "x" })
      .returning({ id: material.id })
      .get().id;
    const pdfChunk = db
      .insert(chunk)
      .values({ materialId: pdfId, ordinal: 0, page: 5, text: "t" })
      .returning({ id: chunk.id })
      .get().id;
    const runId = db
      .insert(generationRun)
      .values({ kind: "card", subtype: "qa", model: "m", requested: 1 })
      .returning({ id: generationRun.id })
      .get().id;
    db.insert(item)
      .values({
        runId,
        kind: "card",
        subtype: "qa",
        payloadJson: JSON.stringify({ front: "f", back: "b" }),
        status: "approved",
        origin: "error_note",
        chunkId: pdfChunk,
        sourcePage: 5,
        quote: "citado",
      })
      .run();
    db.insert(item)
      .values({
        runId,
        kind: "card",
        subtype: "qa",
        payloadJson: JSON.stringify({ front: "g", back: "h" }),
        chunkId: rig.chunkIds[0] ?? null,
        sourcePage: 1,
        quote: "outro",
      })
      .run();
    const listed = rig.core.review(rig.workspaceId).list({ runId });
    expect(listed.map((entry) => entry.pdfSource)).toEqual([
      { materialId: pdfId, page: 5, quote: "citado" },
      null,
    ]);
    expect(rig.core.notebook(rig.workspaceId).entries()[0]?.pdfSource).toEqual({
      materialId: pdfId,
      page: 5,
      quote: "citado",
    });
  });
});
