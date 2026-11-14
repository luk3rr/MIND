/*
 * Filename: migrate.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type Database from "better-sqlite3";
import { AppError } from "../contracts/errors.js";

export interface Migration {
  /** File name without folder, such as `0000_init.sql`; the order is the sort order. */
  id: string;
  sql: string;
}

const BREAKPOINT = "--> statement-breakpoint";

/** Turns the `import.meta.glob` result of a migrations folder into an ordered list. */
export function toMigrations(files: Record<string, string>): Migration[] {
  return Object.entries(files)
    .map(([path, sql]) => ({ id: path.split("/").pop() ?? path, sql }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Applies the pending migrations in order, each inside its own transaction, and records them
 * in `_migrations`. A database that already contains a migration this version does not know was
 * written by a newer app and is refused instead of being modified.
 */
export function applyMigrations(sqlite: Database.Database, migrations: readonly Migration[]): void {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    sqlite
      .prepare("SELECT id FROM _migrations")
      .all()
      .map((row) => (row as { id: string }).id),
  );
  const known = new Set(migrations.map((migration) => migration.id));
  for (const id of applied) {
    if (!known.has(id)) {
      throw new AppError(
        "ARCHIVE_INCOMPATIBLE",
        "Este banco de dados foi criado por uma versão mais nova do MIND.",
      );
    }
  }
  const record = sqlite.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    sqlite.transaction(() => {
      for (const statement of migration.sql.split(BREAKPOINT)) {
        if (statement.trim()) sqlite.exec(statement);
      }
      record.run(migration.id, new Date().toISOString());
    })();
  }
}
