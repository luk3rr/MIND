/*
 * Filename: archive.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import yauzl from "yauzl";
import yazl from "yazl";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../db/migrate.js";
import { workspaceMigrations } from "../db/migrations.js";
import {
  chatMessage,
  chunk,
  item,
  material,
  studySession,
  topic,
  generationRun,
} from "../db/workspace-schema.js";
import { tempDir } from "../test/helpers.js";
import {
  FORMAT,
  MAX_MEMBERS,
  currentRevision,
  downloadName,
  exportWorkspace,
  importWorkspace,
} from "./archive.js";
import type { Manifest } from "./archive.js";
import { WorkspaceRegistry } from "./registry.js";

const registries: WorkspaceRegistry[] = [];
afterEach(() => {
  for (const registry of registries.splice(0)) registry.close();
});

const folders = new Map<WorkspaceRegistry, string>();

function newRegistry(): WorkspaceRegistry {
  const data = join(tempDir(), "data");
  const registry = new WorkspaceRegistry(data);
  registries.push(registry);
  folders.set(registry, data);
  return registry;
}

function populated(registry: WorkspaceRegistry): number {
  const info = registry.create("Biologia");
  const workspace = registry.open(info.id);
  const stored = join(workspace.filesDir, "abc", "aula.md");
  mkdirSync(join(workspace.filesDir, "abc"), { recursive: true });
  writeFileSync(stored, "# Célula\n\nA mitocôndria produz energia.");
  const { db } = workspace.connection;
  const materialId = db
    .insert(material)
    .values({ title: "Aula", kind: "md", filename: "aula.md", storedPath: "files/abc/aula.md" })
    .returning({ id: material.id })
    .get().id;
  db.insert(chunk)
    .values({ materialId, ordinal: 0, page: 1, text: "A mitocôndria produz energia." })
    .run();
  db.insert(topic).values({ name: "Célula" }).run();
  db.insert(chatMessage)
    .values({ question: "Q?", answer: "R.", supported: false, citationsJson: "[]" })
    .run();
  return info.id;
}

type Member = [name: string, content: string | Buffer];

async function writeZip(target: string, members: Member[]): Promise<string> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of members) {
    zip.addBuffer(Buffer.from(content), name, { forceDosTimestamp: true });
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(target));
  return target;
}

function readZip(path: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const found = new Map<string, Buffer>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (data: Buffer) => chunks.push(data));
          stream.on("end", () => {
            found.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(found));
      zip.readEntry();
    });
  });
}

/** Rewrites an archive, changing the manifest and optionally adding members. */
async function rewrite(
  archive: string,
  target: string,
  changes: Partial<Manifest> | null,
  extra: Member[] = [],
): Promise<string> {
  const members = await readZip(archive);
  const manifest = { ...JSON.parse(members.get("manifest.json")?.toString() ?? "{}"), ...changes };
  const rest: Member[] = [...members].filter(([name]) => name !== "manifest.json");
  const all: Member[] =
    changes === null
      ? [...rest, ...extra]
      : [["manifest.json", JSON.stringify(manifest)], ...rest, ...extra];
  return writeZip(target, all);
}

describe("exportWorkspace and importWorkspace (FR-22)", () => {
  it("restores data and files under a suffixed name after a round trip", async () => {
    const registry = newRegistry();
    const source = populated(registry);
    const dir = tempDir();
    const archive = await exportWorkspace(registry, source, join(dir, "backup.zip"), {
      appVersion: "1.2.3",
      now: new Date("2026-11-14T12:00:00.000Z"),
    });
    const members = await readZip(archive);
    expect([...members.keys()].sort()).toEqual([
      "files/abc/aula.md",
      "manifest.json",
      "workspace.db",
    ]);
    expect(JSON.parse(members.get("manifest.json")?.toString() ?? "{}")).toEqual({
      format: FORMAT,
      format_version: 1,
      app_version: "1.2.3",
      schema_revision: currentRevision(),
      workspace_name: "Biologia",
      exported_at: "2026-11-14T12:00:00.000Z",
    });

    const first = await importWorkspace(registry, archive);
    expect(first.name).toBe("Biologia (importado)");
    expect((await importWorkspace(registry, archive)).name).toBe("Biologia (importado 2)");
    const restored = registry.open(first.id);
    expect(readFileSync(join(restored.filesDir, "abc", "aula.md"), "utf8")).toMatch(/^# Célula/);
    const { db } = restored.connection;
    expect(
      db
        .select()
        .from(material)
        .all()
        .map((m) => m.title),
    ).toEqual(["Aula"]);
    expect(
      db
        .select()
        .from(topic)
        .all()
        .map((t) => t.name),
    ).toEqual(["Célula"]);
    expect(db.select().from(chatMessage).all()).toHaveLength(1);
    expect(db.select().from(item).all()).toEqual([]);
    expect(db.select().from(generationRun).all()).toEqual([]);
    // The full-text index travels with the database and keeps working.
    const found = restored.connection.sqlite
      .prepare("SELECT count(*) AS n FROM chunk_fts WHERE chunk_fts MATCH 'mitocôndria'")
      .get() as { n: number };
    expect(found.n).toBe(1);
  });

  it("writes a consistent snapshot of the database", async () => {
    const registry = newRegistry();
    const archive = await exportWorkspace(registry, populated(registry), join(tempDir(), "b.zip"));
    const database = (await readZip(archive)).get("workspace.db") as Buffer;
    const path = join(tempDir(), "x.db");
    writeFileSync(path, database);
    const sqlite = new Database(path, { readonly: true });
    expect(sqlite.pragma("integrity_check")).toEqual([{ integrity_check: "ok" }]);
    expect(sqlite.prepare("SELECT title FROM material").all()).toEqual([{ title: "Aula" }]);
    sqlite.close();
  });

  it("never includes the key or global settings", async () => {
    const registry = newRegistry();
    const archive = await exportWorkspace(registry, populated(registry), join(tempDir(), "b.zip"));
    expect(
      [...(await readZip(archive)).keys()].every((n) =>
        /^(manifest\.json|workspace\.db|files\/)/.test(n),
      ),
    ).toBe(true);
  });

  it("refuses newer formats and unknown schemas without leaving a workspace behind", async () => {
    const registry = newRegistry();
    const archive = await exportWorkspace(registry, populated(registry), join(tempDir(), "b.zip"));
    const dir = tempDir();
    await expect(
      importWorkspace(registry, await rewrite(archive, join(dir, "n.zip"), { format_version: 99 })),
    ).rejects.toMatchObject({ code: "ARCHIVE_INCOMPATIBLE" });
    await expect(
      importWorkspace(
        registry,
        await rewrite(archive, join(dir, "s.zip"), { schema_revision: "9999_x.sql" }),
      ),
    ).rejects.toMatchObject({ code: "ARCHIVE_INCOMPATIBLE" });
    expect(registry.list()).toHaveLength(1);
  });

  it("migrates an older schema on import", async () => {
    const registry = newRegistry();
    const dir = tempDir();
    const old = join(dir, "workspace.db");
    const sqlite = new Database(old);
    applyMigrations(sqlite, workspaceMigrations.slice(0, 1));
    sqlite.close();
    const older = await writeZip(join(dir, "older.zip"), [
      [
        "manifest.json",
        JSON.stringify({
          format: FORMAT,
          format_version: 1,
          schema_revision: workspaceMigrations[0]?.id,
        }),
      ],
      ["workspace.db", readFileSync(old)],
    ]);
    const copy = await importWorkspace(registry, older);
    expect(copy.name).toBe("Workspace importado");
    const tables = registry
      .open(copy.id)
      .connection.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'chunk_fts'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it("takes the study sessions along in a backup and a restore (FR-11)", async () => {
    const registry = newRegistry();
    const source = populated(registry);
    const { db } = registry.open(source).connection;
    db.insert(studySession)
      .values({
        startedAt: "2026-03-10T10:00:00.000Z",
        endedAt: "2026-03-10T10:10:00.000Z",
        seconds: 600,
        source: "manual",
        day: "2026-03-10",
      })
      .run();
    const archive = await exportWorkspace(registry, source, join(tempDir(), "b.zip"));
    const copy = await importWorkspace(registry, archive);
    const restored = registry.open(copy.id).connection.db.select().from(studySession).all();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ seconds: 600, source: "manual", day: "2026-03-10" });
  });

  it("imports a backup made before the study sessions existed and adds the table (FR-11)", async () => {
    const registry = newRegistry();
    const dir = tempDir();
    const old = join(dir, "workspace.db");
    const sqlite = new Database(old);
    applyMigrations(sqlite, workspaceMigrations.slice(0, 3));
    sqlite.close();
    const older = await writeZip(join(dir, "before-time.zip"), [
      [
        "manifest.json",
        JSON.stringify({
          format: FORMAT,
          format_version: 1,
          schema_revision: workspaceMigrations[2]?.id,
        }),
      ],
      ["workspace.db", readFileSync(old)],
    ]);
    const copy = await importWorkspace(registry, older);
    expect(registry.open(copy.id).connection.db.select().from(studySession).all()).toEqual([]);
  });

  it.each(["other/file.txt", "workspace.db.bak", "manifest.json.old"])(
    "refuses the member %s",
    async (member) => {
      const registry = newRegistry();
      const archive = await exportWorkspace(
        registry,
        populated(registry),
        join(tempDir(), "b.zip"),
      );
      const bad = await rewrite(archive, join(tempDir(), "bad.zip"), {}, [[member, "x"]]);
      await expect(importWorkspace(registry, bad)).rejects.toMatchObject({
        code: "ARCHIVE_INVALID",
      });
      expect(registry.list()).toHaveLength(1);
    },
  );

  it.each([
    ["XXXevil.txt", "../evil.txt"],
    ["Xabs.txt", "/abs.txt"],
    ["files/XXXXXXXXXXXXevil.txt", "files/../../../../evil.txt"],
  ])("refuses the member name %s once patched to %s", async (placeholder, name) => {
    // The zip writer refuses such names, so the bytes of a harmless name are patched.
    const registry = newRegistry();
    const archive = await exportWorkspace(registry, populated(registry), join(tempDir(), "b.zip"));
    const good = await rewrite(archive, join(tempDir(), "good.zip"), {}, [[placeholder, "x"]]);
    const bytes = readFileSync(good);
    const patched = Buffer.from(bytes.toString("latin1").split(placeholder).join(name), "latin1");
    expect(patched.length).toBe(bytes.length);
    const bad = join(tempDir(), "bad.zip");
    writeFileSync(bad, patched);
    await expect(importWorkspace(registry, bad)).rejects.toMatchObject({ code: "ARCHIVE_INVALID" });
    expect(registry.list()).toHaveLength(1);
  });

  it("refuses files that are not backups", async () => {
    const registry = newRegistry();
    const dir = tempDir();
    writeFileSync(join(dir, "x.zip"), "not a zip");
    await expect(importWorkspace(registry, join(dir, "x.zip"))).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    await expect(importWorkspace(registry, join(dir, "missing.zip"))).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    const noManifest = await writeZip(join(dir, "m.zip"), [["workspace.db", ""]]);
    await expect(importWorkspace(registry, noManifest)).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    const other = await writeZip(join(dir, "o.zip"), [
      ["manifest.json", JSON.stringify({ format: "other" })],
    ]);
    await expect(importWorkspace(registry, other)).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    const broken = await writeZip(join(dir, "b.zip"), [["manifest.json", "{nope"]]);
    await expect(importWorkspace(registry, broken)).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    const noDatabase = await writeZip(join(dir, "d.zip"), [
      [
        "manifest.json",
        JSON.stringify({ format: FORMAT, format_version: 1, schema_revision: currentRevision() }),
      ],
    ]);
    await expect(importWorkspace(registry, noDatabase)).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
      message: expect.stringContaining("banco de dados"),
    });
    const bigManifest = await writeZip(join(dir, "big.zip"), [
      ["manifest.json", Buffer.alloc(2 * 1024 * 1024, 32)],
    ]);
    await expect(importWorkspace(registry, bigManifest)).rejects.toMatchObject({
      code: "ARCHIVE_INVALID",
    });
    expect(registry.list()).toEqual([]);
  });

  it("removes the folder when the database inside is not a database", async () => {
    const registry = newRegistry();
    const dir = tempDir();
    const bad = await writeZip(join(dir, "bad.zip"), [
      [
        "manifest.json",
        JSON.stringify({ format: FORMAT, format_version: 1, schema_revision: currentRevision() }),
      ],
      ["workspace.db", "this is not sqlite"],
    ]);
    await expect(importWorkspace(registry, bad)).rejects.toThrow();
    expect(registry.list()).toEqual([]);
    const data = folders.get(registry) as string;
    expect(readdirSync(join(data, "workspaces"))).toEqual([]);
    expect(existsSync(join(data, "app.db"))).toBe(true);
  });

  it("limits the number of members", () => {
    expect(MAX_MEMBERS).toBe(100_000);
  });
});

describe("downloadName", () => {
  it("builds a safe file name", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    expect(downloadName({ id: 1, name: "Biologia & Células!", createdAt: "x" }, now)).toBe(
      "mind-biologia---células-2026-11-14.zip",
    );
    expect(downloadName({ id: 1, name: "!!!", createdAt: "x" }, now)).toBe(
      "mind-workspace-2026-11-14.zip",
    );
  });
});
