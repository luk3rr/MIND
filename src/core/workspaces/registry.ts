/*
 * Filename: registry.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { logger } from "../logging.js";

const log = logger("workspace");
import { and, asc, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppError } from "../contracts/errors.js";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { openAppDatabase, openWorkspaceDatabase } from "../db/databases.js";
import type { AppConnection, WorkspaceConnection } from "../db/databases.js";
import { workspace } from "../db/app-schema.js";
import { recoverInterrupted } from "../jobs/store.js";

export const MAX_NAME_LENGTH = 80;

export interface WorkspaceInfo {
  id: number;
  name: string;
  createdAt: string;
}

/** Access to an open workspace: its database and files folder. */
export interface OpenWorkspace {
  info: WorkspaceInfo;
  connection: WorkspaceConnection;
  root: string;
  filesDir: string;
}

export interface Logger {
  warn(message: string): void;
}

const NAME_TAKEN = "Já existe um workspace com esse nome.";

function nameTaken(): AppError {
  return new AppError("VALIDATION_ERROR", NAME_TAKEN, [
    { field: "name", message: "Nome já em uso." },
  ]);
}

function notFound(id: number): AppError {
  return new AppError("WORKSPACE_NOT_FOUND", `Não existe workspace com id ${id}.`);
}

/** Validates the name and returns the clean name and its case-insensitive uniqueness key. */
export function normalizeName(raw: string): { name: string; key: string } {
  const name = raw.split(/\s+/).filter(Boolean).join(" ");
  if (!name) {
    throw new AppError("VALIDATION_ERROR", "O nome do workspace não pode ser vazio.", [
      { field: "name", message: "Informe um nome." },
    ]);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      `O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.`,
      [{ field: "name", message: `No máximo ${MAX_NAME_LENGTH} caracteres.` }],
    );
  }
  return { name, key: name.normalize("NFKC").toLowerCase() };
}

export class WorkspaceRegistry {
  private readonly app: AppConnection;
  private readonly workspacesDir: string;
  private readonly open_ = new Map<number, OpenWorkspace>();

  constructor(
    private readonly dataDir: string,
    private readonly clock: Clock = systemClock,
    private readonly logger: Logger = console,
  ) {
    this.workspacesDir = resolve(dataDir, "workspaces");
    mkdirSync(this.workspacesDir, { recursive: true });
    this.app = openAppDatabase(join(dataDir, "app.db"));
    this.removeOrphanFolders();
  }

  /** The global database (settings, consent and costs live there). */
  get appDatabase(): AppConnection {
    return this.app;
  }

  close(): void {
    for (const opened of this.open_.values()) opened.connection.close();
    this.open_.clear();
    this.app.close();
  }

  private folderPath(folder: string): string {
    const path = resolve(this.workspacesDir, folder);
    if (resolve(path, "..") !== this.workspacesDir) {
      throw new AppError("VALIDATION_ERROR", "Pasta de workspace inválida.");
    }
    return path;
  }

  private removeOrphanFolders(): void {
    const known = new Set(
      this.app.db
        .select({ folder: workspace.folder })
        .from(workspace)
        .all()
        .map((row) => row.folder),
    );
    for (const entry of readdirSync(this.workspacesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !known.has(entry.name)) {
        this.logger.warn(`Removing orphan workspace folder: ${entry.name}`);
        rmSync(join(this.workspacesDir, entry.name), { recursive: true, force: true });
      }
    }
  }

  private isNameKeyTaken(key: string, exceptId?: number): boolean {
    const clash =
      exceptId === undefined
        ? eq(workspace.nameKey, key)
        : and(eq(workspace.nameKey, key), ne(workspace.id, exceptId));
    return (
      this.app.db.select({ id: workspace.id }).from(workspace).where(clash).get() !== undefined
    );
  }

  private static info(row: typeof workspace.$inferSelect): WorkspaceInfo {
    return { id: row.id, name: row.name, createdAt: row.createdAt };
  }

  create(rawName: string): WorkspaceInfo {
    const { name, key } = normalizeName(rawName);
    if (this.isNameKeyTaken(key)) throw nameTaken();
    const folder = randomUUID().replaceAll("-", "");
    const root = this.folderPath(folder);
    try {
      mkdirSync(join(root, "files"), { recursive: true });
      openWorkspaceDatabase(join(root, "workspace.db")).close();
      const row = this.app.db
        .insert(workspace)
        .values({ name, nameKey: key, folder, createdAt: isoNow(this.clock) })
        .returning()
        .get();
      log.info("workspace created", { workspace: row.id });
      return WorkspaceRegistry.info(row);
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Creates a workspace whose folder `populate` fills (the backup import). `populate` receives the
   * new folder and must leave a `workspace.db` and may add `files/`; the database is migrated to
   * the current schema afterwards. Any failure removes the folder, so nothing half-imported stays.
   */
  async createFrom(
    rawName: string,
    populate: (root: string) => Promise<void>,
  ): Promise<WorkspaceInfo> {
    const { name, key } = normalizeName(rawName);
    if (this.isNameKeyTaken(key)) throw nameTaken();
    const folder = randomUUID().replaceAll("-", "");
    const root = this.folderPath(folder);
    try {
      mkdirSync(root, { recursive: true });
      await populate(root);
      mkdirSync(join(root, "files"), { recursive: true });
      openWorkspaceDatabase(join(root, "workspace.db")).close();
      const row = this.app.db
        .insert(workspace)
        .values({ name, nameKey: key, folder, createdAt: isoNow(this.clock) })
        .returning()
        .get();
      return WorkspaceRegistry.info(row);
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  list(): WorkspaceInfo[] {
    return this.app.db
      .select()
      .from(workspace)
      .orderBy(asc(workspace.nameKey))
      .all()
      .map((row) => WorkspaceRegistry.info(row));
  }

  get(id: number): WorkspaceInfo {
    const row = this.app.db.select().from(workspace).where(eq(workspace.id, id)).get();
    if (!row) throw notFound(id);
    return WorkspaceRegistry.info(row);
  }

  rename(id: number, rawName: string): WorkspaceInfo {
    const { name, key } = normalizeName(rawName);
    const current = this.get(id);
    if (this.isNameKeyTaken(key, current.id)) throw nameTaken();
    const row = this.app.db
      .update(workspace)
      .set({ name, nameKey: key })
      .where(eq(workspace.id, id))
      .returning()
      .get();
    const opened = this.open_.get(id);
    if (opened) opened.info = WorkspaceRegistry.info(row);
    return WorkspaceRegistry.info(row);
  }

  delete(id: number): void {
    const row = this.app.db.select().from(workspace).where(eq(workspace.id, id)).get();
    if (!row) throw notFound(id);
    this.app.db.delete(workspace).where(eq(workspace.id, id)).run();
    log.info("workspace deleted", { workspace: id });
    this.open_.get(id)?.connection.close();
    this.open_.delete(id);
    try {
      rmSync(this.folderPath(row.folder), { recursive: true });
    } catch {
      this.logger.warn(
        `Could not delete folder ${row.folder}; it will be removed on the next start.`,
      );
    }
  }

  open(id: number): OpenWorkspace {
    const cached = this.open_.get(id);
    if (cached) return cached;
    const row = this.app.db.select().from(workspace).where(eq(workspace.id, id)).get();
    if (!row) throw notFound(id);
    const root = this.folderPath(row.folder);
    const connection = openWorkspaceDatabase(join(root, "workspace.db"));
    recoverInterrupted(connection.db, this.clock);
    const opened: OpenWorkspace = {
      info: WorkspaceRegistry.info(row),
      connection,
      root,
      filesDir: join(root, "files"),
    };
    this.open_.set(id, opened);
    log.info("workspace opened", { workspace: id });
    return opened;
  }
}
