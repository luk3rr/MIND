/*
 * Filename: retriever.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chunk, material } from "../db/workspace-schema.js";
import { tempDir } from "../test/helpers.js";
import { WorkspaceRegistry } from "../workspaces/registry.js";
import type { OpenWorkspace } from "../workspaces/registry.js";
import { Bm25Retriever, buildMatchQuery } from "./retriever.js";

let registry: WorkspaceRegistry;
let workspace: OpenWorkspace;
let retriever: Bm25Retriever;

beforeEach(() => {
  registry = new WorkspaceRegistry(tempDir(), undefined, { warn: () => undefined });
  workspace = registry.open(registry.create("A").id);
  retriever = new Bm25Retriever(workspace.connection);
});

afterEach(() => registry.close());

function addMaterial(title: string): number {
  return workspace.connection.db
    .insert(material)
    .values({ title, kind: "text", filename: `${title}.md`, storedPath: "p", status: "indexed" })
    .returning()
    .get().id;
}

function addChunk(
  materialId: number,
  ordinal: number,
  text: string,
  page: number | null = null,
): number {
  return workspace.connection.db
    .insert(chunk)
    .values({ materialId, ordinal, text, page })
    .returning()
    .get().id;
}

describe("buildMatchQuery", () => {
  it("quotes the terms and joins them with OR", () => {
    expect(buildMatchQuery("fotossíntese e clorofila")).toBe(
      '"fotossíntese" OR "e" OR "clorofila"',
    );
  });

  it("neutralizes FTS syntax and returns null without terms", () => {
    expect(buildMatchQuery('a" OR NEAR(b) -c*')).toBe('"a" OR "OR" OR "NEAR" OR "b" OR "c"');
    expect(buildMatchQuery("  !!! ")).toBeNull();
    expect(buildMatchQuery("")).toBeNull();
  });

  it("limits the number of terms", () => {
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`).join(" ");
    expect(buildMatchQuery(many)?.split(" OR ")).toHaveLength(32);
  });
});

describe("FTS index", () => {
  it("follows inserts, updates and cascade deletes", () => {
    const id = addMaterial("Bio");
    const first = addChunk(id, 0, "A fotossíntese ocorre nos cloroplastos.");
    expect(retriever.search("cloroplastos")).toHaveLength(1);
    workspace.connection.sqlite
      .prepare("UPDATE chunk SET text = ? WHERE id = ?")
      .run("Texto sobre mitocôndrias.", first);
    expect(retriever.search("cloroplastos")).toHaveLength(0);
    expect(retriever.search("mitocôndrias")).toHaveLength(1);
    workspace.connection.sqlite.prepare("DELETE FROM material WHERE id = ?").run(id);
    expect(retriever.search("mitocôndrias")).toHaveLength(0);
  });
});

describe("Bm25Retriever", () => {
  it("finds chunks ignoring accents and case and returns their origin", () => {
    const id = addMaterial("Bio");
    addChunk(id, 0, "A Fotossíntese converte luz em energia.", 12);
    const [hit] = retriever.search("fotossintese");
    expect(hit).toMatchObject({ materialTitle: "Bio", page: 12, section: null });
    expect(hit?.score).toBeGreaterThan(0);
  });

  it("ranks the better match first and respects the limit", () => {
    const id = addMaterial("Bio");
    addChunk(id, 0, "célula célula célula núcleo");
    addChunk(id, 1, "uma célula");
    addChunk(id, 2, "nada relacionado");
    const hits = retriever.search("célula");
    expect(hits.map((h) => h.text)).toEqual(["célula célula célula núcleo", "uma célula"]);
    expect(retriever.search("célula", { limit: 1 })).toHaveLength(1);
    expect(retriever.search("célula", { limit: 0 })).toEqual([]);
  });

  it("filters by material and by page range", () => {
    const a = addMaterial("A");
    const b = addMaterial("B");
    addChunk(a, 0, "átomo", 1);
    addChunk(a, 1, "átomo", 5);
    addChunk(b, 0, "átomo", 2);
    expect(retriever.search("átomo", { materialIds: [a] })).toHaveLength(2);
    expect(retriever.search("átomo", { materialIds: [] })).toEqual([]);
    expect(retriever.search("átomo", { pageFrom: 2, pageTo: 5 })).toHaveLength(2);
    expect(retriever.search("átomo", { materialIds: [a], pageFrom: 3 })).toHaveLength(1);
  });

  it("returns nothing for an empty query", () => {
    addChunk(addMaterial("A"), 0, "texto");
    expect(retriever.search("   ")).toEqual([]);
  });
});
