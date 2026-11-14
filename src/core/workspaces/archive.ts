/*
 * Filename: archive.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { logger } from "../logging.js";

const log = logger("backup");
import { createWriteStream, mkdirSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import yauzl from "yauzl";
import type { Entry, ZipFile } from "yauzl";
import yazl from "yazl";
import { AppError } from "../contracts/errors.js";
import { workspaceMigrations } from "../db/migrations.js";
import type { WorkspaceInfo, WorkspaceRegistry } from "./registry.js";

export const FORMAT = "mind-workspace";
export const FORMAT_VERSION = 1;
export const MANIFEST = "manifest.json";
export const DATABASE = "workspace.db";
export const FILES = "files";
export const MAX_UNPACKED_BYTES = 8 * 1024 ** 3;
export const MAX_MEMBERS = 100_000;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_NAME_SUFFIX = 50;

export interface Manifest {
  format: string;
  format_version: number;
  app_version: string;
  schema_revision: string;
  workspace_name: string;
  exported_at: string;
}

/** The newest migration of the workspace schema: what a backup was written with. */
export function currentRevision(): string {
  return workspaceMigrations.at(-1)?.id ?? "";
}

function listFiles(folder: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...listFiles(join(folder, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found.sort();
}

/** Writes the backup of a workspace to `target` and returns it. */
export async function exportWorkspace(
  registry: WorkspaceRegistry,
  workspaceId: number,
  target: string,
  options: { appVersion?: string; now?: Date } = {},
): Promise<string> {
  const workspace = registry.open(workspaceId);
  const scratch = await mkdtemp(join(tmpdir(), "mind-export-"));
  try {
    const snapshot = join(scratch, DATABASE);
    // A consistent copy even while the write-ahead log has pages that are not in the file yet.
    await workspace.connection.sqlite.backup(snapshot);
    const manifest: Manifest = {
      format: FORMAT,
      format_version: FORMAT_VERSION,
      app_version: options.appVersion ?? "0.0.0",
      schema_revision: currentRevision(),
      workspace_name: workspace.info.name,
      exported_at: (options.now ?? new Date()).toISOString(),
    };
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST);
    zip.addFile(snapshot, DATABASE);
    for (const name of listFiles(workspace.filesDir)) {
      zip.addFile(join(workspace.filesDir, name), `${FILES}/${name}`);
    }
    zip.end();
    await pipeline(zip.outputStream, createWriteStream(target));
    log.info("workspace exported", { workspace: workspaceId, bytes: statSync(target).size });
    return target;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function invalid(message: string): AppError {
  return new AppError("ARCHIVE_INVALID", message);
}

function incompatible(message: string): AppError {
  return new AppError("ARCHIVE_INCOMPATIBLE", message);
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(invalid("O arquivo não é um .zip válido."));
      else resolve(zip);
    });
  });
}

function readEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zip.on("entry", (entry: Entry) => {
      entries.push(entry);
      if (entries.length > MAX_MEMBERS) reject(invalid("O backup é grande demais."));
      else zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.on("error", () => reject(invalid("O arquivo não é um .zip válido.")));
    zip.readEntry();
  });
}

function openStream(zip: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(invalid("O backup está corrompido."));
      else resolve(stream);
    });
  });
}

async function readManifest(zip: ZipFile, entries: Entry[]): Promise<Manifest> {
  const entry = entries.find((e) => e.fileName === MANIFEST);
  if (!entry || entry.uncompressedSize > MAX_MANIFEST_BYTES) {
    throw invalid("O arquivo não tem um manifest.json válido.");
  }
  const stream = await openStream(zip, entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw invalid("O arquivo não tem um manifest.json válido.");
  }
  const manifest = parsed as Partial<Manifest> | null;
  if (typeof manifest !== "object" || manifest === null || manifest.format !== FORMAT) {
    throw invalid("O arquivo não é um backup de workspace do MIND.");
  }
  if (
    !Number.isInteger(manifest.format_version) ||
    (manifest.format_version as number) > FORMAT_VERSION
  ) {
    throw incompatible(
      "Este backup vem de uma versão mais nova do MIND. Atualize o app para importá-lo.",
    );
  }
  const known = new Set(workspaceMigrations.map((m) => m.id));
  if (typeof manifest.schema_revision !== "string" || !known.has(manifest.schema_revision)) {
    throw incompatible(
      "O banco do backup tem uma versão desconhecida; atualize o MIND e tente de novo.",
    );
  }
  return manifest as Manifest;
}

function checkMembers(entries: readonly Entry[]): void {
  if (entries.reduce((sum, e) => sum + e.uncompressedSize, 0) > MAX_UNPACKED_BYTES) {
    throw invalid("O backup é grande demais.");
  }
  if (!entries.some((e) => e.fileName === DATABASE)) {
    throw invalid("O backup não contém o banco de dados.");
  }
  for (const { fileName } of entries) {
    const path = posix.normalize(fileName.replace(/\/$/, ""));
    const parts = fileName.replace(/\/$/, "").split("/");
    const insideFiles = parts[0] === FILES;
    const allowed = fileName === MANIFEST || fileName === DATABASE || insideFiles;
    if (
      fileName.startsWith("/") ||
      parts.includes("..") ||
      fileName.includes("\\") ||
      path.startsWith("..") ||
      !allowed
    ) {
      throw invalid(`O backup contém um caminho não permitido: ${JSON.stringify(fileName)}.`);
    }
  }
}

/** Copies an entry to disk while counting the real bytes, so a lying header cannot overflow. */
async function extract(zip: ZipFile, entry: Entry, destination: string, budget: { left: number }) {
  mkdirSync(dirname(destination), { recursive: true });
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      budget.left -= chunk.length;
      done(budget.left < 0 ? invalid("O backup é grande demais.") : null, chunk);
    },
  });
  await pipeline(await openStream(zip, entry), counter, createWriteStream(destination));
}

/** Creates a new workspace from a backup. The name gets a suffix when it is already taken. */
export async function importWorkspace(
  registry: WorkspaceRegistry,
  source: string,
): Promise<WorkspaceInfo> {
  const zip = await openZip(source);
  try {
    const entries = await readEntries(zip);
    const manifest = await readManifest(zip, entries);
    checkMembers(entries);
    const base = manifest.workspace_name?.trim() || "Workspace importado";
    const populate = async (root: string): Promise<void> => {
      const budget = { left: MAX_UNPACKED_BYTES };
      for (const entry of entries) {
        if (entry.fileName === MANIFEST || entry.fileName.endsWith("/")) continue;
        await extract(zip, entry, join(root, ...entry.fileName.split("/")), budget);
      }
    };
    for (let suffix = 0; ; suffix += 1) {
      const name = suffix === 0 ? base : `${base} (importado${suffix === 1 ? "" : ` ${suffix}`})`;
      try {
        const created = await registry.createFrom(name, populate);
        log.info("workspace imported", { workspace: created.id, members: entries.length });
        return created;
      } catch (error) {
        const nameTaken =
          error instanceof AppError && error.fields?.some((field) => field.field === "name");
        if (!nameTaken || suffix >= MAX_NAME_SUFFIX) throw error;
      }
    }
  } finally {
    zip.close();
  }
}

/** A safe file name such as `mind-biologia-2026-11-14.zip`. */
export function downloadName(info: WorkspaceInfo, now: Date = new Date()): string {
  const slug =
    [...info.name.toLowerCase()]
      .map((char) => (/[\p{L}\p{N}]/u.test(char) ? char : "-"))
      .join("")
      .replace(/^-+|-+$/g, "") || "workspace";
  return `mind-${slug}-${now.toISOString().slice(0, 10)}.zip`;
}
