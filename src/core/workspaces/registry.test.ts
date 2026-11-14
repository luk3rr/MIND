/*
 * Filename: registry.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../contracts/errors.js";
import { fixedClock, tempDir } from "../test/helpers.js";
import { MAX_NAME_LENGTH, WorkspaceRegistry } from "./registry.js";
import { material } from "../db/workspace-schema.js";

const quiet = { warn: () => undefined };
let dataDir: string;
let registry: WorkspaceRegistry;

beforeEach(() => {
  dataDir = tempDir();
  registry = new WorkspaceRegistry(dataDir, fixedClock(), quiet);
});

afterEach(() => registry.close());

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppError ? error.code : "OTHER";
  }
  return undefined;
}

describe("WorkspaceRegistry", () => {
  it("creates a folder with a migrated database and a files directory", () => {
    const info = registry.create("Biologia");
    const opened = registry.open(info.id);
    expect(info.name).toBe("Biologia");
    expect(existsSync(join(opened.root, "workspace.db"))).toBe(true);
    expect(existsSync(opened.filesDir)).toBe(true);
    expect(opened.connection.sqlite.prepare("SELECT COUNT(*) AS n FROM job").get()).toEqual({
      n: 0,
    });
  });

  it("stamps creation time as an ISO-8601 UTC timestamp", () => {
    expect(registry.create("A").createdAt).toBe("2026-01-01T12:00:00.000Z");
  });

  it("keeps names unique ignoring case and surrounding spaces", () => {
    registry.create("Estudos");
    expect(codeOf(() => registry.create("  estudos "))).toBe("VALIDATION_ERROR");
    expect(registry.list()).toHaveLength(1);
  });

  it.each(["", "   ", "x".repeat(MAX_NAME_LENGTH + 1)])("rejects the invalid name %j", (name) => {
    expect(codeOf(() => registry.create(name))).toBe("VALIDATION_ERROR");
    expect(registry.list()).toHaveLength(0);
  });

  it("collapses inner whitespace in names", () => {
    expect(registry.create("  Direito   Civil ").name).toBe("Direito Civil");
  });

  it("isolates the data of different workspaces", () => {
    const a = registry.open(registry.create("A").id);
    const b = registry.open(registry.create("B").id);
    a.connection.db
      .insert(material)
      .values({ title: "t", kind: "md", filename: "f", storedPath: "p" })
      .run();
    expect(a.connection.db.select().from(material).all()).toHaveLength(1);
    expect(b.connection.db.select().from(material).all()).toHaveLength(0);
  });

  it("deletes only the chosen workspace and its folder", () => {
    const a = registry.create("A");
    const b = registry.create("B");
    const folderA = registry.open(a.id).root;
    registry.delete(a.id);
    expect(existsSync(folderA)).toBe(false);
    expect(registry.list().map((w) => w.name)).toEqual(["B"]);
    expect(existsSync(registry.open(b.id).root)).toBe(true);
    expect(codeOf(() => registry.open(a.id))).toBe("WORKSPACE_NOT_FOUND");
  });

  it("renames with a uniqueness check and updates an open workspace", () => {
    const a = registry.create("A");
    registry.create("B");
    const opened = registry.open(a.id);
    expect(codeOf(() => registry.rename(a.id, "b"))).toBe("VALIDATION_ERROR");
    expect(registry.rename(a.id, "A renomeado").name).toBe("A renomeado");
    expect(opened.info.name).toBe("A renomeado");
    expect(registry.rename(a.id, "A RENOMEADO").name).toBe("A RENOMEADO");
  });

  it("reports an unknown workspace", () => {
    expect(codeOf(() => registry.open(999))).toBe("WORKSPACE_NOT_FOUND");
    expect(codeOf(() => registry.get(999))).toBe("WORKSPACE_NOT_FOUND");
    expect(codeOf(() => registry.rename(999, "x"))).toBe("WORKSPACE_NOT_FOUND");
    expect(codeOf(() => registry.delete(999))).toBe("WORKSPACE_NOT_FOUND");
  });

  it("returns the same open workspace on repeated opens", () => {
    const { id } = registry.create("A");
    expect(registry.open(id)).toBe(registry.open(id));
  });

  it("lists workspaces ordered by name", () => {
    registry.create("banana");
    registry.create("Abacaxi");
    expect(registry.list().map((w) => w.name)).toEqual(["Abacaxi", "banana"]);
  });

  it("removes orphan folders on start", () => {
    registry.create("Keep");
    const orphan = join(dataDir, "workspaces", "orphan");
    mkdirSync(orphan);
    registry.close();
    registry = new WorkspaceRegistry(dataDir, fixedClock(), quiet);
    expect(existsSync(orphan)).toBe(false);
    expect(readdirSync(join(dataDir, "workspaces"))).toHaveLength(1);
  });

  it("never lets a folder name escape the workspaces directory", () => {
    const registryInternals = registry as unknown as { folderPath(folder: string): string };
    expect(() => registryInternals.folderPath("../outside")).toThrowError(AppError);
    expect(() => registryInternals.folderPath("a/b")).toThrowError(AppError);
  });
});
