/*
 * Filename: chunk-labels.test.ts
 * Created on: November 20, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Role } from "../analysis/classifier.js";
import { chunk, material } from "../db/workspace-schema.js";
import { generationRig } from "../test/generation-fixture.js";
import type { GenerationRig } from "../test/generation-fixture.js";

let rig: GenerationRig | undefined;
afterEach(async () => {
  await rig?.core.close();
  rig = undefined;
});

/** An analyzed material whose chunks are labelled as `layout` says: [role, opens a unit]. */
function analyzed(layout: [Role | null, boolean][]) {
  rig = generationRig({ texts: layout.map((_, i) => `Trecho ${i}`) });
  const { db } = rig.core.registry.open(rig.workspaceId).connection;
  let unit = 0;
  layout.forEach(([role, starts], position) => {
    if (starts || role === null || position === 0) unit += 1;
    db.update(chunk)
      .set({ role, startsUnit: starts ? 1 : 0, unit })
      .where(eq(chunk.id, rig?.chunkIds[position] as number))
      .run();
  });
  db.update(material)
    .set({ analyzedAt: "2026-11-20T00:00:00.000Z" })
    .where(eq(material.id, rig.materialId))
    .run();
  const service = rig.core.materials(rig.workspaceId);
  const labels = () =>
    db
      .select({ role: chunk.role, starts: chunk.startsUnit, unit: chunk.unit })
      .from(chunk)
      .orderBy(asc(chunk.ordinal))
      .all();
  return { service, db, labels, id: (position: number) => rig?.chunkIds[position] as number };
}

describe("the labels of a chunk (FR-8)", () => {
  it("shows the role, whether it opens a unit and the unit of each chunk", () => {
    const { service } = analyzed([
      ["concept", true],
      ["example", false],
      ["exam_question", true],
    ]);
    expect(
      service.chunks(rig?.materialId as number).map((c) => [c.role, c.startsUnit, c.unit]),
    ).toEqual([
      ["concept", true, 1],
      ["example", false, 1],
      ["exam_question", true, 2],
    ]);
  });

  it("filters the chunks by role, or by none, and counts them the same way", () => {
    const { service } = analyzed([
      ["concept", true],
      ["exam_question", true],
      [null, true],
      ["concept", true],
    ]);
    const id = rig?.materialId as number;
    expect(service.chunks(id, { role: "concept" }).map((c) => c.ordinal)).toEqual([0, 3]);
    expect(service.chunkCount(id, "concept")).toBe(2);
    expect(service.chunks(id, { role: "none" }).map((c) => c.ordinal)).toEqual([2]);
    expect(service.chunkCount(id, "none")).toBe(1);
    expect(service.chunks(id, { role: "other" })).toEqual([]);
    expect(service.chunkCount(id)).toBe(4);
  });
});

describe("correcting a chunk", () => {
  it("changes the role and leaves the units where they are", () => {
    const { service, labels, id } = analyzed([
      ["concept", true],
      ["motivating_text", true],
      ["exam_question", false],
    ]);
    const changed = service.setChunkLabel(id(1), { role: "other" });
    expect(changed).toMatchObject({ role: "other", startsUnit: true, unit: 2 });
    expect(labels().map((l) => [l.role, l.unit])).toEqual([
      ["concept", 1],
      ["other", 2],
      ["exam_question", 2],
    ]);
  });

  it("numbers the units again when a chunk starts one, and when it stops", () => {
    const { service, labels, id } = analyzed([
      ["concept", true],
      ["example", false],
      ["example", false],
      ["exam_question", true],
    ]);
    service.setChunkLabel(id(2), { startsUnit: true });
    expect(labels().map((l) => l.unit)).toEqual([1, 1, 2, 3]);
    service.setChunkLabel(id(1), { startsUnit: true });
    expect(labels().map((l) => l.unit)).toEqual([1, 2, 3, 4]);
    service.setChunkLabel(id(1), { startsUnit: false });
    service.setChunkLabel(id(2), { startsUnit: false });
    expect(labels().map((l) => l.unit)).toEqual([1, 1, 1, 2]);
  });

  it("changes the role and the start of a unit together", () => {
    const { service, labels, id } = analyzed([
      ["concept", true],
      ["example", false],
    ]);
    service.setChunkLabel(id(1), { role: "commentary", startsUnit: true });
    expect(labels().map((l) => [l.role, l.starts, l.unit])).toEqual([
      ["concept", 1, 1],
      ["commentary", 1, 2],
    ]);
  });

  it("always opens a unit at the first chunk", () => {
    const { service, labels, id } = analyzed([
      ["concept", true],
      ["example", false],
    ]);
    const first = service.setChunkLabel(id(0), { startsUnit: false });
    expect(first).toMatchObject({ startsUnit: true, unit: 1 });
    expect(labels().map((l) => l.unit)).toEqual([1, 1]);
  });

  it("gives a role to a chunk the analysis left without one", () => {
    const { service, labels, id } = analyzed([
      ["concept", true],
      [null, true],
      ["example", false],
    ]);
    // The chunk with no role is a unit of its own, and the one after it continues that unit.
    expect(labels().map((l) => l.unit)).toEqual([1, 2, 2]);
    service.setChunkLabel(id(1), { role: "example" });
    // It keeps opening its own unit until the person says otherwise.
    expect(labels().map((l) => [l.role, l.unit])).toEqual([
      ["concept", 1],
      ["example", 2],
      ["example", 2],
    ]);
  });

  it("is refused for an unknown chunk, an empty change and a material that is not analyzed", () => {
    const { service, db, id } = analyzed([["concept", true]]);
    const field = (error: unknown) =>
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "chunkId", message: error })],
      });
    expect(() => service.setChunkLabel(9999, { role: "other" })).toThrowError(
      field("Trecho não encontrado."),
    );
    expect(() => service.setChunkLabel(id(0), {})).toThrowError(
      field("Informe o papel ou o início de unidade."),
    );
    db.update(material)
      .set({ analyzedAt: null })
      .where(eq(material.id, rig?.materialId as number))
      .run();
    expect(() => service.setChunkLabel(id(0), { role: "other" })).toThrowError(
      field("Analise o material antes de corrigir os papéis."),
    );
  });

  it("is used by the generation at once: a chunk turned into a cover is no longer sent", async () => {
    const { service, id } = analyzed([
      ["concept", true],
      ["concept", true],
    ]);
    const generation = rig?.core.generation(rig.workspaceId);
    const request = {
      materialId: rig?.materialId as number,
      subtype: "qa",
      quantity: 5,
      kind: "card" as const,
    };
    expect(generation?.estimate(request).chunks).toBe(2);
    service.setChunkLabel(id(1), { role: "other" });
    expect(generation?.estimate(request).chunks).toBe(1);
  });
});
